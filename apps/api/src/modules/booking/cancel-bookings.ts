import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not } from 'typeorm';
import type { Tx } from '../../shared/db';
import { AppError } from '../../shared/errors';
import {
  BOOKING_CANCELLATION_IN_TX,
  type BookingCancellationInTx,
  type BookingCancelled,
  publishDomainEvent,
} from '../../shared/events';
import { CATALOG_API, type CatalogApi } from '../flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import { BookingEntity } from './booking.entity';

const CANCELLATION_CUTOFF_MS = 24 * 60 * 60 * 1000;

export interface FlightBookingCancellation {
  cancelForFlight(tx: Tx, flightId: string): Promise<BookingCancelled[]>;
}

export const FLIGHT_BOOKING_CANCELLATION = Symbol('FLIGHT_BOOKING_CANCELLATION');

@Injectable()
export class CancelBookings implements FlightBookingCancellation {
  private readonly logger = new Logger(CancelBookings.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    private readonly events: EventEmitter2,
  ) {}

  async cancelOwned(reference: string, ownerId: string) {
    const event = await this.db.transaction('READ COMMITTED', async (tx) => {
      const booking = await tx.findOne(BookingEntity, {
        where: { reference, ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) throw AppError.notFound('NOT_FOUND', 'Not found.');
      if (booking.status === 'CANCELLED') return null;
      await this.ensureEligible(tx, booking);
      return this.cancel(tx, booking, 'TRAVELER');
    });

    if (event) {
      try {
        await publishDomainEvent(this.events, event);
      } catch {
        this.logger.warn(
          { bookingId: event.bookingId },
          'Booking cancelled, but an observer failed',
        );
      }
    }
    return { status: 'CANCELLED' as const };
  }

  private async ensureEligible(tx: Tx, booking: BookingEntity): Promise<void> {
    if (booking.status !== 'CONFIRMED') {
      throw AppError.conflict('BOOKING_NOT_CONFIRMED', 'Only confirmed bookings can be cancelled.');
    }
    const flight = await this.catalog.getFlight(booking.flightId, tx);
    if (!flight || flight.scheduledDepartureUtc.getTime() - Date.now() < CANCELLATION_CUTOFF_MS) {
      throw AppError.conflict(
        'CANCELLATION_CUTOFF',
        'Traveler cancellations close 24 hours before departure.',
      );
    }
  }

  async cancelForFlight(tx: Tx, flightId: string): Promise<BookingCancelled[]> {
    const bookings = await tx.find(BookingEntity, {
      where: { flightId, status: Not('CANCELLED') },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const events: BookingCancelled[] = [];
    for (const booking of bookings) events.push(await this.cancel(tx, booking, 'AIRLINE'));
    return events;
  }

  private async cancel(tx: Tx, booking: BookingEntity, reason: BookingCancelled['reason']) {
    const released = await this.inventory.release(tx, booking.holdId);
    if (!released.ok) throw new Error('Booking hold could not be released');
    await tx.update(BookingEntity, booking.id, { status: 'CANCELLED' });
    const event = {
      type: 'BookingCancelled' as const,
      eventId: randomUUID(),
      bookingId: booking.id,
      ownerId: booking.ownerId,
      ref: booking.reference,
      reason,
    };
    const recording: BookingCancellationInTx = { tx, paymentId: booking.paymentId };
    await this.events.emitAsync(BOOKING_CANCELLATION_IN_TX, recording);
    return event;
  }
}
