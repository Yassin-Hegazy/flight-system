import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { type BookingExpired, publishDomainEvent } from '../../shared/events';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import { recordTransition } from './booking-history';
import { BookingEntity } from './booking.entity';
import { segmentsInLockOrder } from './booking-segments';
import { stateFor } from './booking-state';

const BATCH = 100;
const MAX_BATCHES = 50;

/** The scheduled-job port Booking exposes: `expireOverdue` of Booking pack section 2. */
export interface BookingExpiry {
  expireOverdue(now: Date): Promise<number>;
}

export const BOOKING_EXPIRY = Symbol('BOOKING_EXPIRY');

/**
 * US-BK-07: a PENDING_PAYMENT booking past its hold expiry becomes EXPIRED. Availability already
 * ignores expired holds, so seats are back on sale the instant the hold lapses; this job only
 * tidies the booking's status. Safe to run twice or in parallel (NFR-REL-02): each booking is
 * locked and its status re-read, so only the run that finds it still pending acts on it.
 */
@Injectable()
export class ExpireBookings implements BookingExpiry {
  private readonly logger = new Logger(ExpireBookings.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    private readonly events: EventEmitter2,
  ) {}

  async expireOverdue(now: Date): Promise<number> {
    let expired = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const due = await this.db.manager.find(BookingEntity, {
        select: { id: true },
        where: { status: 'PENDING_PAYMENT', expiresAt: LessThanOrEqual(now) },
        order: { expiresAt: 'ASC', id: 'ASC' },
        take: BATCH,
      });
      if (due.length === 0) break;
      for (const { id } of due) {
        const event = await this.expireOne(id, now);
        if (event) {
          expired += 1;
          await this.publish(event);
        }
      }
    }
    return expired;
  }

  private expireOne(id: string, now: Date): Promise<BookingExpired | null> {
    return this.db.transaction('READ COMMITTED', async (tx) => {
      const booking = await tx.findOne(BookingEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      // Paid, cancelled or expired by someone else while this run waited for the lock.
      if (
        !booking ||
        booking.status !== 'PENDING_PAYMENT' ||
        !booking.expiresAt ||
        booking.expiresAt.getTime() > now.getTime()
      ) {
        return null;
      }
      const next = stateFor(booking.status).expire();
      // Releases only a still-HELD hold at or past its expiry; anything else is a no-op.
      for (const segment of await segmentsInLockOrder(tx, booking.id)) {
        const released = await this.inventory.release(tx, segment.holdId, { expiredOnly: true });
        if (!released.ok) throw new Error('Booking hold could not be released');
      }
      await tx.update(BookingEntity, booking.id, { status: next.name });
      await recordTransition(tx, booking.id, booking.status, next.name, 'EXPIRY');
      return {
        type: 'BookingExpired' as const,
        eventId: randomUUID(),
        bookingId: booking.id,
        ownerId: booking.ownerId,
        ref: booking.reference,
      };
    });
  }

  private async publish(event: BookingExpired): Promise<void> {
    try {
      await publishDomainEvent(this.events, event);
    } catch {
      this.logger.warn({ bookingId: event.bookingId }, 'Booking expired, but an observer failed');
    }
  }
}
