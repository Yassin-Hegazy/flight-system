import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CLOCK, type Clock } from '../../shared/time';
import { BOOKING_EXPIRY, type BookingExpiry } from './expire-bookings';

/**
 * The scheduled trigger for US-BK-07. Every minute meets the story's "at least once a minute".
 * A failed run is simply retried by the next one and must never crash the process.
 */
@Injectable()
export class BookingExpiryJob {
  private readonly logger = new Logger(BookingExpiryJob.name);

  constructor(
    @Inject(BOOKING_EXPIRY) private readonly expiry: BookingExpiry,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'booking-expiry' })
  async run(): Promise<void> {
    try {
      const expired = await this.expiry.expireOverdue(this.clock.now());
      if (expired > 0) this.logger.log({ expired }, 'Unpaid bookings expired');
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        { err: { name: failure.name, message: failure.message } },
        'Booking expiry run failed',
      );
    }
  }
}
