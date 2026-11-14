import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import type { Tx } from '../../shared/db';
import { AppError } from '../../shared/errors';
import {
  BOOKING_CANCELLATION_IN_TX,
  BOOKING_TICKET_VOID_IN_TX,
  type BookingCancellationInTx,
  type BookingCancelled,
  publishDomainEvent,
} from '../../shared/events';
import { CLOCK, type Clock } from '../../shared/time';
import { CATALOG_API, type CatalogApi } from '../flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import { recordTransition } from './booking-history';
import { type BookingView, loadView } from './booking-view';
import { BookingEntity } from './booking.entity';
import { bookingIdsOnFlight, segmentsInLockOrder } from './booking-segments';
import {
  type Actor,
  CancellationWindowClosed,
  InvalidBookingTransition,
  NON_TERMINAL_STATUSES,
  stateFor,
} from './booking-state';

export interface FlightBookingCancellation {
  cancelForFlight(tx: Tx, flightId: string): Promise<BookingCancelled[]>;
}

export const FLIGHT_BOOKING_CANCELLATION = Symbol('FLIGHT_BOOKING_CANCELLATION');

/**
 * US-BK-05 and US-BK-08. The State classes decide whether a cancellation is allowed; this use case
 * only acts when the state really changed, which is how a repeated cancel stays harmless: no
 * second release, no second refund, no second event.
 */
@Injectable()
export class CancelBookings implements FlightBookingCancellation {
  private readonly logger = new Logger(CancelBookings.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
  ) {}

  async cancelOwned(reference: string, ownerId: string): Promise<BookingView> {
    const { event, view } = await this.db.transaction('READ COMMITTED', async (tx) => {
      const booking = await tx.findOne(BookingEntity, {
        where: { reference: reference.toUpperCase(), ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) throw AppError.notFound('NOT_FOUND', 'Not found.');
      const flight = await this.catalog.getFlight(booking.flightId, tx);
      const by: Actor = { kind: 'TRAVELER', userId: ownerId };
      const current = stateFor(booking.status);
      const next = this.decide(() =>
        current.cancel({
          by,
          now: this.clock.now(),
          departureUtc: flight?.scheduledDepartureUtc ?? null,
        }),
      );
      // Same state back: already cancelled, nothing to do.
      if (next === current) return { event: null, view: await loadView(tx, booking) };
      const cancelled = await this.cancel(tx, booking, 'TRAVELER');
      const fresh = await tx.findOneByOrFail(BookingEntity, { id: booking.id });
      return { event: cancelled, view: await loadView(tx, fresh) };
    });
    await this.publish(event);
    return view;
  }

  /** Airline cancellation: every non-terminal booking on the flight, in the caller's transaction. */
  async cancelForFlight(tx: Tx, flightId: string): Promise<BookingCancelled[]> {
    const bookings = await tx.find(BookingEntity, {
      // Any booking with a leg on the flight: an airline cancelling the return cancels the trip.
      where: {
        id: In(await bookingIdsOnFlight(tx, flightId)),
        status: In([...NON_TERMINAL_STATUSES]),
      },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const events: BookingCancelled[] = [];
    for (const booking of bookings) {
      // The airline is not bound by the traveler's 24-hour cut-off.
      stateFor(booking.status).cancel({
        by: { kind: 'AIRLINE' },
        now: this.clock.now(),
        departureUtc: null,
      });
      events.push(await this.cancel(tx, booking, 'AIRLINE'));
    }
    return events;
  }

  /** Maps the State classes' rejections to the API's errors. */
  private decide<T>(move: () => T): T {
    try {
      return move();
    } catch (error) {
      if (error instanceof CancellationWindowClosed) {
        throw AppError.conflict(
          'CANCELLATION_CUTOFF',
          'Traveler cancellations close 24 hours before departure.',
        );
      }
      if (error instanceof InvalidBookingTransition) {
        throw AppError.conflict(
          'INVALID_BOOKING_TRANSITION',
          'This booking can no longer be cancelled.',
        );
      }
      throw error;
    }
  }

  private async publish(event: BookingCancelled | null): Promise<void> {
    if (!event) return;
    try {
      await publishDomainEvent(this.events, event);
    } catch {
      this.logger.warn({ bookingId: event.bookingId }, 'Booking cancelled, but an observer failed');
    }
  }

  private async cancel(
    tx: Tx,
    booking: BookingEntity,
    reason: BookingCancelled['reason'],
  ): Promise<BookingCancelled> {
    for (const segment of await segmentsInLockOrder(tx, booking.id)) {
      const released = await this.inventory.release(tx, segment.holdId);
      if (!released.ok) throw new Error('Booking hold could not be released');
    }
    await tx.update(BookingEntity, booking.id, { status: 'CANCELLED', cancelReason: reason });
    await recordTransition(tx, booking.id, booking.status, 'CANCELLED', reason);
    const event: BookingCancelled = {
      type: 'BookingCancelled',
      eventId: randomUUID(),
      bookingId: booking.id,
      ownerId: booking.ownerId,
      ref: booking.reference,
      reason,
    };
    const recording: BookingCancellationInTx = {
      tx,
      paymentId: booking.paymentId,
      bookingId: booking.id,
    };
    // One transaction owns a single PostgreSQL connection, so the two writers run in order:
    // void the tickets, then record the refund. Both commit with the cancellation (US-BK-05 AC-5);
    // the refund itself is sent to the gateway after commit.
    await this.events.emitAsync(BOOKING_TICKET_VOID_IN_TX, recording);
    await this.events.emitAsync(BOOKING_CANCELLATION_IN_TX, recording);
    return event;
  }
}
