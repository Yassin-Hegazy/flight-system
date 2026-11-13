import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BOOKING_TICKETING, type BookingTicketing } from '../booking/index';
import { IssueTickets } from './issue-tickets';

const BATCH = 50;

/**
 * NFR-REL-02: issues tickets for bookings left CONFIRMED after a failed issuance. Safe to run
 * twice or at the same time as itself, because IssueTickets is idempotent per booking.
 */
@Injectable()
export class TicketRepairJob {
  private readonly logger = new Logger(TicketRepairJob.name);

  constructor(
    @Inject(BOOKING_TICKETING) private readonly booking: BookingTicketing,
    private readonly issue: IssueTickets,
  ) {}

  @Cron('*/5 * * * *', { name: 'ticket-repair', waitForCompletion: true })
  async run(): Promise<void> {
    for (const bookingId of await this.booking.awaitingTickets(BATCH)) {
      try {
        await this.issue.execute(bookingId);
      } catch (error) {
        this.logger.warn({ bookingId, err: error }, 'Ticket repair will retry this booking');
      }
    }
  }
}
