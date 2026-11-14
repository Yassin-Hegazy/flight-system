import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUniqueViolation, type Tx } from '../../shared/db';
import { AppError } from '../../shared/errors';
import { CLOCK, type Clock } from '../../shared/time';
import {
  CATALOG_API,
  type CatalogApi,
  type Cabin,
  type FlightInfo,
  type PriceQuote,
} from '../flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import { recordTransition } from './booking-history';
import { BookingIdempotencyEntity } from './booking-idempotency.entity';
import { BookingPassengerEntity } from './booking-passenger.entity';
import { BookingSegmentEntity } from './booking-segment.entity';
import { type BookingView, loadView } from './booking-view';
import { BookingEntity } from './booking.entity';
import {
  countParty,
  type PassengerInput,
  seatsNeeded,
  validatePassengers,
} from './passenger-rules';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export interface CreateBookingCommand {
  ownerId: string;
  /** Used only when the request has no passenger list: the owner travels alone. */
  ownerName: string;
  flightId: string;
  cabin: Cabin;
  passengers?: PassengerInput[];
  /** The total the client displayed, in minor units. A different current total is rejected. */
  displayedTotal?: number;
}

function newReference(): string {
  return Array.from(randomBytes(6), (byte) => REFERENCE_ALPHABET[byte & 31]).join('');
}

interface Passenger {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  type: PassengerInput['type'];
}

interface Prepared {
  passengers: Passenger[];
  quote: PriceQuote;
  seats: number;
}

/**
 * US-BK-01 and US-BK-03: creates a booking. The steps are a strict sequence, so they are written
 * imperatively (Booking pack, section 6.2): replay check first (cheapest, avoids duplicates), then
 * the cheap rules with no locks held, then the atomic part. The idempotency record is saved inside
 * the same transaction, so a crash can never remember an answer for a rolled-back booking.
 */
@Injectable()
export class CreateBooking {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateBookingCommand, idempotencyKey?: string): Promise<BookingView> {
    const hash = requestHash(command);
    // 1. Replay.
    if (idempotencyKey) {
      const replay = await this.replay(command.ownerId, idempotencyKey, hash);
      if (replay) return replay;
    }
    // 2. The cheap rules, before any lock is taken.
    const early = await this.catalog.getFlight(command.flightId);
    this.prepare(early, command);

    // 3. The atomic part.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.db.transaction('READ COMMITTED', (tx) =>
          this.createInTransaction(tx, command, hash, idempotencyKey),
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // A concurrent request with the same key won the race: answer with its booking.
        if (idempotencyKey) {
          const replay = await this.replay(command.ownerId, idempotencyKey, hash);
          if (replay) return replay;
        }
        // Otherwise the random reference collided: try again with a new one.
      }
    }
    throw new Error('Could not allocate a unique booking reference');
  }

  private async createInTransaction(
    tx: Tx,
    command: CreateBookingCommand,
    hash: string,
    key: string | undefined,
  ): Promise<BookingView> {
    // The flight row is locked, so its status and fares cannot change under this booking.
    const flight = await this.catalog.getFlightForUpdate(tx, command.flightId);
    const { passengers, quote, seats } = this.prepare(flight, command);

    const id = randomUUID();
    const hold = await this.inventory.hold(tx, {
      bookingId: id,
      flightId: command.flightId,
      cabin: command.cabin,
      seats,
    });
    if (!hold.ok) {
      throw AppError.conflict(hold.error, 'The requested seats are unavailable.');
    }
    const eligibility = await this.inventory.validateForPayment(hold.value, id, tx);
    if (!eligibility.ok) throw new Error('A new hold must be payable');

    const booking = await tx.save(BookingEntity, {
      id,
      reference: newReference(),
      ownerId: command.ownerId,
      passengerName: `${passengers[0].firstName} ${passengers[0].lastName}`.trim(),
      flightId: command.flightId,
      cabin: command.cabin,
      holdId: hold.value,
      amountMinor: quote.total.amountMinor,
      currency: quote.total.currency,
      status: 'PENDING_PAYMENT',
      expiresAt: eligibility.value.expiresAt,
      cancelReason: null,
      paymentId: null,
    });
    await tx.insert(BookingSegmentEntity, {
      id: randomUUID(),
      bookingId: id,
      position: 0,
      flightId: command.flightId,
      cabin: command.cabin,
      holdId: hold.value,
    });
    // The fare snapshot: each passenger's fare is copied in and never looked up again.
    const fareOf = (type: Passenger['type']) =>
      quote.lines.find((line) => line.passengerType === type)!.unitPrice;
    await tx.insert(
      BookingPassengerEntity,
      passengers.map((passenger, position) => ({
        id: randomUUID(),
        bookingId: id,
        position,
        firstName: passenger.firstName,
        lastName: passenger.lastName,
        birthDate: passenger.birthDate,
        type: passenger.type,
        fareMinor: fareOf(passenger.type).amountMinor,
        currency: quote.total.currency,
      })),
    );
    await recordTransition(tx, id, null, 'PENDING_PAYMENT', 'CREATED');
    if (key) {
      await tx.insert(BookingIdempotencyEntity, {
        ownerId: command.ownerId,
        key,
        requestHash: hash,
        bookingId: id,
      });
    }
    return loadView(tx, booking);
  }

  /**
   * Every rule that needs no lock, in the order a traveler would fix them. Run once before the
   * transaction (so a rejection holds nothing) and again inside it against the locked flight.
   */
  private prepare(flight: FlightInfo | null, command: CreateBookingCommand): Prepared {
    const now = this.clock.now();
    if (!flight || !this.catalog.isBookable(flight, now)) {
      throw AppError.conflict(
        'FLIGHT_UNAVAILABLE',
        'The requested flight and cabin are unavailable.',
      );
    }
    const passengers: Passenger[] = command.passengers
      ? this.validated(command.passengers, flight, now)
      : [{ ...splitName(command.ownerName), birthDate: null, type: 'ADULT' }];

    const quote = this.catalog.priceParty(flight, command.cabin, countParty(passengers));
    if (!quote.ok) {
      if (quote.error === 'NO_FARE') {
        throw AppError.conflict(
          'FLIGHT_UNAVAILABLE',
          'The requested flight and cabin are unavailable.',
        );
      }
      throw AppError.badRequest('VALIDATION_ERROR', 'Some fields are invalid.', {
        passengers:
          quote.error === 'TOO_MANY_INFANTS'
            ? 'There cannot be more infants than adults.'
            : 'The party needs at least one adult or child.',
      });
    }
    // Charging more than was shown, without asking, is the failure this stops (US-BK-03 AC-3).
    if (
      command.displayedTotal !== undefined &&
      command.displayedTotal !== quote.value.total.amountMinor
    ) {
      throw AppError.conflict('PRICE_CHANGED', 'The fare changed since it was displayed.', {
        currentTotal: String(quote.value.total.amountMinor),
        currency: quote.value.total.currency,
      });
    }
    return { passengers, quote: quote.value, seats: seatsNeeded(countParty(passengers)) };
  }

  private validated(
    passengers: readonly PassengerInput[],
    flight: FlightInfo,
    now: Date,
  ): Passenger[] {
    // Age is judged on the local departure date: a child can turn 12 between booking and flying.
    const departureDate = flight.scheduledDepartureLocal.slice(0, 10);
    const errors = validatePassengers(passengers, departureDate, now.toISOString().slice(0, 10));
    if (Object.keys(errors).length > 0) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Some fields are invalid.', errors);
    }
    return passengers.map(({ firstName, lastName, birthDate, type }) => ({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      type,
    }));
  }

  /** The booking a key already produced, or null; an old key (over 24 h) is forgotten. */
  private async replay(ownerId: string, key: string, hash: string): Promise<BookingView | null> {
    const remembered = await this.db.manager.findOneBy(BookingIdempotencyEntity, { ownerId, key });
    if (!remembered) return null;
    if (this.clock.now().getTime() - remembered.createdAt.getTime() > IDEMPOTENCY_WINDOW_MS) {
      await this.db.manager.delete(BookingIdempotencyEntity, { ownerId, key });
      return null;
    }
    if (remembered.requestHash !== hash) {
      throw AppError.conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different booking request.',
      );
    }
    const booking = await this.db.manager.findOneByOrFail(BookingEntity, {
      id: remembered.bookingId,
    });
    return loadView(this.db.manager, booking);
  }
}

function splitName(name: string): Pick<Passenger, 'firstName' | 'lastName'> {
  return { firstName: name.trim(), lastName: '' };
}

function requestHash(command: CreateBookingCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        command.flightId,
        command.cabin,
        command.passengers ?? null,
        command.displayedTotal ?? null,
      ]),
    )
    .digest('hex');
}
