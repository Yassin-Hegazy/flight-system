import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUniqueViolation, type Tx } from '../../shared/db';
import { AppError } from '../../shared/errors';
import { money, type Money } from '../../shared/money';
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
  type PassengerKind,
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
  /** A round trip's return flight (US-FS-06 AC-3): the reverse route, after the outbound lands. */
  returnFlightId?: string;
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

/** One flight of the booking with its price for the whole party. */
interface Leg {
  flight: FlightInfo;
  quote: PriceQuote;
}

interface Prepared {
  passengers: Passenger[];
  /** Outbound first, then the return if there is one. */
  legs: Leg[];
  total: Money;
  seats: number;
}

const unavailable = () =>
  AppError.conflict('FLIGHT_UNAVAILABLE', 'The requested flight and cabin are unavailable.');

const badReturn = (message: string) =>
  AppError.badRequest('VALIDATION_ERROR', 'Some fields are invalid.', { returnFlightId: message });

const unitPrice = (quote: PriceQuote, type: PassengerKind) =>
  quote.lines.find((line) => line.passengerType === type)?.unitPrice;

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
    this.prepare(await this.flights(command, (id) => this.catalog.getFlight(id)), command);

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
    // The flight rows are locked, so their status and fares cannot change under this booking.
    const flights = await this.flights(command, (id) => this.catalog.getFlightForUpdate(tx, id));
    const { passengers, legs, total, seats } = this.prepare(flights, command);

    const id = randomUUID();
    const holds = await this.holdEveryLeg(tx, id, legs, command.cabin, seats);
    const outbound = holds.get(command.flightId)!;
    const booking = await tx.save(BookingEntity, {
      id,
      reference: newReference(),
      ownerId: command.ownerId,
      passengerName: `${passengers[0].firstName} ${passengers[0].lastName}`.trim(),
      flightId: command.flightId,
      cabin: command.cabin,
      holdId: outbound.holdId,
      amountMinor: total.amountMinor,
      currency: total.currency,
      status: 'PENDING_PAYMENT',
      // The booking lapses when its first hold does.
      expiresAt: new Date(
        Math.min(...[...holds.values()].map(({ expiresAt }) => expiresAt.getTime())),
      ),
      cancelReason: null,
      paymentId: null,
    });
    await tx.insert(
      BookingSegmentEntity,
      legs.map(({ flight, quote }, position) => ({
        id: randomUUID(),
        bookingId: id,
        position,
        flightId: flight.id,
        cabin: command.cabin,
        holdId: holds.get(flight.id)!.holdId,
        unitFares: Object.fromEntries(
          quote.lines.map((line) => [line.passengerType, line.unitPrice.amountMinor]),
        ),
      })),
    );
    // The fare snapshot: each passenger's fare is copied in and never looked up again. On a round
    // trip it is the sum of both legs' fares for that passenger type.
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
        fareMinor: legs.reduce(
          (sum, leg) => sum + unitPrice(leg.quote, passenger.type)!.amountMinor,
          0,
        ),
        currency: total.currency,
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

  /** Outbound, then the return flight if any: null for a flight that does not exist. */
  private async flights(
    command: CreateBookingCommand,
    load: (id: string) => Promise<FlightInfo | null>,
  ): Promise<{ outbound: FlightInfo | null; back?: FlightInfo | null }> {
    if (!command.returnFlightId) return { outbound: await load(command.flightId) };
    // Two flight rows are locked here, so take them in ascending ID order as well.
    const [first, second] = [command.flightId, command.returnFlightId].sort();
    const loaded = new Map([
      [first, await load(first)],
      [second, await load(second)],
    ]);
    return {
      outbound: loaded.get(command.flightId) ?? null,
      back: loaded.get(command.returnFlightId) ?? null,
    };
  }

  /** Holds every leg in ascending flight-ID order; a full leg rolls back the whole booking. */
  private async holdEveryLeg(tx: Tx, bookingId: string, legs: Leg[], cabin: Cabin, seats: number) {
    const holds = new Map<string, { holdId: string; expiresAt: Date }>();
    const ordered = [...legs].sort((a, b) => a.flight.id.localeCompare(b.flight.id));
    for (const { flight } of ordered) {
      const hold = await this.inventory.hold(tx, { bookingId, flightId: flight.id, cabin, seats });
      if (!hold.ok) throw AppError.conflict(hold.error, 'The requested seats are unavailable.');
      const eligibility = await this.inventory.validateForPayment(hold.value, bookingId, tx);
      if (!eligibility.ok) throw new Error('A new hold must be payable');
      holds.set(flight.id, { holdId: hold.value, expiresAt: eligibility.value.expiresAt });
    }
    return holds;
  }

  /**
   * Every rule that needs no lock, in the order a traveler would fix them. Run once before the
   * transaction (so a rejection holds nothing) and again inside it against the locked flights.
   */
  private prepare(
    { outbound, back }: { outbound: FlightInfo | null; back?: FlightInfo | null },
    command: CreateBookingCommand,
  ): Prepared {
    const now = this.clock.now();
    if (!outbound || !this.catalog.isBookable(outbound, now)) throw unavailable();
    const flights = [outbound];
    if (back !== undefined) flights.push(this.checkedReturn(outbound, back, now));
    const passengers: Passenger[] = command.passengers
      ? this.validated(command.passengers, outbound, now)
      : [{ ...splitName(command.ownerName), birthDate: null, type: 'ADULT' }];

    const legs = flights.map((flight) => ({
      flight,
      quote: this.quote(flight, command.cabin, passengers),
    }));
    const total = sumOf(legs.map(({ quote }) => quote.total));
    // Charging more than was shown, without asking, is the failure this stops (US-BK-03 AC-3).
    if (command.displayedTotal !== undefined && command.displayedTotal !== total.amountMinor) {
      throw AppError.conflict('PRICE_CHANGED', 'The fare changed since it was displayed.', {
        currentTotal: String(total.amountMinor),
        currency: total.currency,
      });
    }
    return { passengers, legs, total, seats: seatsNeeded(countParty(passengers)) };
  }

  /** The return leg flies the outbound's route backwards, after the outbound lands. */
  private checkedReturn(outbound: FlightInfo, back: FlightInfo | null, now: Date): FlightInfo {
    if (!back || !this.catalog.isBookable(back, now)) throw unavailable();
    if (
      back.origin.code !== outbound.destination.code ||
      back.destination.code !== outbound.origin.code
    ) {
      throw badReturn('The return flight must fly from the destination back to the origin.');
    }
    if (back.scheduledDepartureUtc.getTime() < outbound.scheduledArrivalUtc.getTime()) {
      throw badReturn('The return flight must leave after the outbound flight arrives.');
    }
    return back;
  }

  private quote(flight: FlightInfo, cabin: Cabin, passengers: Passenger[]): PriceQuote {
    const quote = this.catalog.priceParty(flight, cabin, countParty(passengers));
    if (quote.ok) return quote.value;
    if (quote.error === 'NO_FARE') throw unavailable();
    throw AppError.badRequest('VALIDATION_ERROR', 'Some fields are invalid.', {
      passengers:
        quote.error === 'TOO_MANY_INFANTS'
          ? 'There cannot be more infants than adults.'
          : 'The party needs at least one adult or child.',
    });
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
  const fields: unknown[] = [
    command.flightId,
    command.cabin,
    command.passengers ?? null,
    command.displayedTotal ?? null,
  ];
  if (command.returnFlightId) fields.push(command.returnFlightId);
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

/** Both legs are charged together, so they must be priced in one currency. */
function sumOf(totals: Money[]): Money {
  const currency = totals[0].currency;
  if (totals.some((total) => total.currency !== currency)) {
    throw AppError.conflict('FLIGHT_UNAVAILABLE', 'Both flights must be priced in one currency.');
  }
  return money(
    totals.reduce((sum, total) => sum + total.amountMinor, 0),
    currency,
  );
}
