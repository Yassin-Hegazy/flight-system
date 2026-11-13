import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUniqueViolation, type Tx } from '../../shared/db';
import { AppError } from '../../shared/errors';
import { money } from '../../shared/money';
import { err, ok } from '../../shared/result';
import { CATALOG_API, type Cabin, type CatalogApi } from '../flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import type { BookingOwners } from './booking-owners';
import type { BookingPayments } from './booking-payments';
import type { BookingTicketing, TicketingBooking } from './booking-ticketing';
import { BookingEntity, type BookingStatus } from './booking.entity';

/** Statuses in which the booking has been paid for. */
const PAID: readonly BookingStatus[] = ['CONFIRMED', 'TICKETED'];

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function reference(): string {
  return Array.from(randomBytes(6), (byte) => REFERENCE_ALPHABET[byte & 31]).join('');
}

function view(booking: BookingEntity) {
  return {
    reference: booking.reference,
    flightId: booking.flightId,
    cabin: booking.cabin,
    status: booking.status,
    amount: money(booking.amountMinor, booking.currency),
  };
}

@Injectable()
export class BookingService implements BookingPayments, BookingOwners, BookingTicketing {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    private readonly events: EventEmitter2,
  ) {}

  /** The M2 path reserves one adult seat and snapshots its fare. */
  async reserve(ownerId: string, passengerName: string, flightId: string, cabin: Cabin) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.transaction('READ COMMITTED', async (tx) => {
          const flight = await this.catalog.getFlightForUpdate(tx, flightId);
          const fare = flight?.fares[cabin];
          if (!flight || !fare || !this.catalog.isBookable(flight, new Date())) {
            throw AppError.conflict(
              'FLIGHT_UNAVAILABLE',
              'The requested flight and cabin are unavailable.',
            );
          }
          const id = randomUUID();
          const hold = await this.inventory.hold(tx, { bookingId: id, flightId, cabin, seats: 1 });
          if (!hold.ok) throw AppError.conflict(hold.error, 'The requested seat is unavailable.');
          const booking = await tx.save(BookingEntity, {
            id,
            reference: reference(),
            ownerId,
            passengerName,
            flightId,
            cabin,
            holdId: hold.value,
            amountMinor: fare.amountMinor,
            currency: fare.currency,
            status: 'PENDING_PAYMENT',
          });
          return view(booking);
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('Could not allocate a unique booking reference');
  }

  private findOwned(reference: string, ownerId: string) {
    return this.db.manager.findOneBy(BookingEntity, { reference, ownerId });
  }

  async ownedId(reference: string, ownerId: string) {
    return (await this.findOwned(reference, ownerId))?.id ?? null;
  }

  async getOwned(reference: string, ownerId: string) {
    const booking = await this.findOwned(reference, ownerId);
    return booking ? view(booking) : null;
  }

  async activeOwnersOf(tx: Tx, flightId: string): Promise<string[]> {
    const bookings = await tx.findBy(BookingEntity, { flightId });
    const owners = new Set<string>();
    for (const booking of bookings) {
      if (owners.has(booking.ownerId)) continue;
      if (
        PAID.includes(booking.status) ||
        (await this.inventory.validateForPayment(booking.holdId, booking.id, tx)).ok
      ) {
        owners.add(booking.ownerId);
      }
    }
    return [...owners];
  }

  async getPayable(reference: string, payerId: string) {
    const booking = await this.findOwned(reference, payerId);
    if (!booking) return err('NOT_FOUND' as const);
    if (PAID.includes(booking.status)) return err('ALREADY_PAID' as const);
    if (booking.status === 'CANCELLED') return err('NOT_FOUND' as const);
    const hold = await this.inventory.validateForPayment(booking.holdId, booking.id);
    if (!hold.ok) return err('HOLD_EXPIRED' as const);
    return ok({ bookingId: booking.id, amount: money(booking.amountMinor, booking.currency) });
  }

  async confirmPaid(tx: Tx, bookingId: string, paymentId: string) {
    const booking = await tx.findOne(BookingEntity, {
      where: { id: bookingId },
      lock: { mode: 'pessimistic_write' },
    });
    if (booking?.status === 'CANCELLED') return err('BOOKING_CANCELLED' as const);
    if (!booking || booking.status !== 'PENDING_PAYMENT') {
      throw new Error('Cannot settle a booking outside PENDING_PAYMENT');
    }
    const seats = await this.inventory.commit(tx, booking.holdId);
    if (!seats.ok) return err('HOLD_EXPIRED' as const);
    await tx.update(BookingEntity, booking.id, { status: 'CONFIRMED', paymentId });
    // Ticketing issues the tickets after this commits, on BookingConfirmed.
    return ok({
      type: 'BookingConfirmed' as const,
      eventId: paymentId,
      bookingId: booking.id,
      ownerId: booking.ownerId,
      ref: booking.reference,
    });
  }

  async getForTicketing(bookingId: string): Promise<TicketingBooking | null> {
    const booking = await this.db.manager.findOneBy(BookingEntity, { id: bookingId });
    if (!booking) return null;
    // The M2 booking has one passenger on one flight: the booking stands for its passenger and
    // the flight for its segment until bookings hold several of each.
    return {
      id: booking.id,
      reference: booking.reference,
      ownerId: booking.ownerId,
      status: booking.status,
      passengers: [
        {
          id: booking.id,
          name: booking.passengerName,
          fare: money(booking.amountMinor, booking.currency),
        },
      ],
      segments: [{ id: booking.flightId, flightId: booking.flightId, cabin: booking.cabin }],
    };
  }

  async markTicketed(tx: Tx, bookingId: string): Promise<boolean> {
    const result = await tx.update(
      BookingEntity,
      { id: bookingId, status: 'CONFIRMED' },
      { status: 'TICKETED' },
    );
    return result.affected === 1;
  }

  async awaitingTickets(limit: number): Promise<string[]> {
    const bookings = await this.db.manager.find(BookingEntity, {
      select: { id: true },
      where: { status: 'CONFIRMED' },
      order: { id: 'ASC' },
      take: limit,
    });
    return bookings.map(({ id }) => id);
  }
}
