import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Tx } from '../../shared/db';
import { money } from '../../shared/money';
import { err, ok } from '../../shared/result';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import type { BookingOwners } from './booking-owners';
import type { BookingPayments } from './booking-payments';
import { recordTransition } from './booking-history';
import { BookingEntity } from './booking.entity';
import { InvalidBookingTransition, stateFor } from './booking-state';
import type { BookingTicketing, EligibleBooking } from './booking-ticketing';
import { BookingPassengerEntity } from './booking-passenger.entity';
import { BookingSegmentEntity } from './booking-segment.entity';

/**
 * What Payments, Ticketing and Administration call into. Creating, reading, cancelling and
 * expiring bookings have a use case each (CreateBooking, BookingQueries, CancelBookings,
 * ExpireBookings), so this class stays small.
 */
@Injectable()
export class BookingService implements BookingPayments, BookingOwners, BookingTicketing {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    private readonly events: EventEmitter2,
  ) {}

  private findOwned(reference: string, ownerId: string) {
    return this.db.manager.findOneBy(BookingEntity, {
      reference: reference.toUpperCase(),
      ownerId,
    });
  }

  /** The guard's lookup: the owner of a reference, or null when it does not exist. */
  async ownerOf(reference: string): Promise<string | null> {
    const booking = await this.db.manager.findOneBy(BookingEntity, {
      reference: reference.toUpperCase(),
    });
    return booking?.ownerId ?? null;
  }

  async ownedId(reference: string, ownerId: string) {
    return (await this.findOwned(reference, ownerId))?.id ?? null;
  }

  async activeOwnersOf(tx: Tx, flightId: string): Promise<string[]> {
    const bookings = await tx.findBy(BookingEntity, { flightId });
    const owners = new Set<string>();
    for (const booking of bookings) {
      if (owners.has(booking.ownerId)) continue;
      if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') continue;
      if (
        booking.status === 'CONFIRMED' ||
        booking.status === 'TICKETED' ||
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
    if (booking.status === 'CONFIRMED' || booking.status === 'TICKETED') {
      return err('ALREADY_PAID' as const);
    }
    if (booking.status === 'CANCELLED') return err('NOT_FOUND' as const);
    if (booking.status === 'EXPIRED') return err('HOLD_EXPIRED' as const);
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
    // The expiry job won the race: the seats are back on sale, so the payment is refunded.
    if (booking?.status === 'EXPIRED') return err('HOLD_EXPIRED' as const);
    if (!booking) throw new Error('Cannot settle a booking that does not exist');
    // The State pattern rejects anything but PENDING_PAYMENT.
    const next = stateFor(booking.status).confirm();
    const seats = await this.inventory.commit(tx, booking.holdId);
    if (!seats.ok) return err('HOLD_EXPIRED' as const);
    await tx.update(BookingEntity, booking.id, { status: next.name, paymentId });
    await recordTransition(tx, booking.id, booking.status, next.name, 'PAYMENT');
    // Ticketing issues the tickets once this commits, on BookingConfirmed.
    return ok({
      type: 'BookingConfirmed' as const,
      eventId: paymentId,
      bookingId: booking.id,
      ownerId: booking.ownerId,
      ref: booking.reference,
    });
  }

  /** Ticketing: the booking with its passengers and segments, in their booking order. */
  async getForTicketing(bookingId: string): Promise<EligibleBooking | null> {
    const booking = await this.db.manager.findOneBy(BookingEntity, { id: bookingId });
    if (!booking) return null;
    const order = { position: 'ASC' } as const;
    const [passengers, segments] = await Promise.all([
      this.db.manager.find(BookingPassengerEntity, { where: { bookingId }, order }),
      this.db.manager.find(BookingSegmentEntity, { where: { bookingId }, order }),
    ]);
    return {
      id: booking.id,
      reference: booking.reference,
      ownerId: booking.ownerId,
      status: booking.status,
      passengers: passengers.map((passenger) => ({
        id: passenger.id,
        name: `${passenger.firstName} ${passenger.lastName}`.trim(),
        fare: money(passenger.fareMinor, passenger.currency),
      })),
      segments: segments.map(({ id, flightId, cabin }) => ({ id, flightId, cabin })),
    };
  }

  /** Ticketing: CONFIRMED becomes TICKETED inside the caller's transaction. */
  async markTicketed(tx: Tx, bookingId: string): Promise<boolean> {
    const booking = await tx.findOne(BookingEntity, {
      where: { id: bookingId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!booking) return false;
    let next;
    try {
      next = stateFor(booking.status).markTicketed();
    } catch (error) {
      // Cancelled or already ticketed meanwhile: the issuing run gives up and rolls back.
      if (error instanceof InvalidBookingTransition) return false;
      throw error;
    }
    await tx.update(BookingEntity, booking.id, { status: next.name });
    await recordTransition(tx, booking.id, booking.status, next.name, 'TICKETING');
    return true;
  }

  /** The ticket-repair job's work list: bookings still CONFIRMED. */
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
