import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUniqueViolation, type Tx } from '../../shared/db';
import { type BookingConfirmed, publishDomainEvent } from '../../shared/events';
import { err, ok, type Result } from '../../shared/result';
import { BOOKING_TICKETING, type BookingTicketing, type TicketingBooking } from '../booking/index';
import type { Ticket } from './ticket';
import { NotEligibleForTicketing, TicketCreator } from './ticket-creator';
import { TicketsRepository } from './tickets.repository';

export type IssueError = 'NOT_FOUND' | 'NOT_ELIGIBLE';

/**
 * US-TK-01: issues a confirmed booking's tickets once, however often it is asked. The checks run
 * in a fixed order (exists, already ticketed, eligible), then the tickets and the booking's move
 * to TICKETED commit together (NFR-CONS-02).
 */
@Injectable()
export class IssueTickets {
  private readonly logger = new Logger(IssueTickets.name);

  constructor(
    @InjectDataSource() private readonly db: Pick<DataSource, 'transaction'>,
    @Inject(BOOKING_TICKETING) private readonly booking: BookingTicketing,
    private readonly tickets: TicketsRepository,
    private readonly creator: TicketCreator,
    private readonly events: EventEmitter2,
  ) {}

  /** After BookingConfirmed commits. A failure leaves the booking CONFIRMED for the repair job. */
  @OnEvent('BookingConfirmed')
  async afterConfirmation(event: BookingConfirmed): Promise<void> {
    try {
      await this.execute(event.bookingId);
    } catch (error) {
      this.logger.warn(
        { bookingId: event.bookingId, err: error },
        'Ticket issuance will be retried',
      );
    }
  }

  async execute(bookingId: string): Promise<Result<Ticket[], IssueError>> {
    const booking = await this.booking.getForTicketing(bookingId);
    if (!booking) return err('NOT_FOUND');
    const existing = await this.tickets.findByBooking(bookingId);
    if (existing.length > 0) return ok(existing);
    if (booking.status !== 'CONFIRMED') return err('NOT_ELIGIBLE');

    let issued: Ticket[];
    try {
      issued = await this.db.transaction('READ COMMITTED', (tx) => this.issue(tx, booking));
    } catch (error) {
      if (!(error instanceof NotEligibleForTicketing) && !isUniqueViolation(error)) throw error;
      // Another run got there first, or the booking was cancelled meanwhile.
      const winner = await this.tickets.findByBooking(bookingId);
      return winner.length > 0 ? ok(winner) : err('NOT_ELIGIBLE');
    }
    await this.announce(booking);
    return ok(issued);
  }

  private async issue(tx: Tx, booking: TicketingBooking) {
    // Marking first locks the booking row, so a concurrent cancellation waits for this commit.
    if (!(await this.booking.markTicketed(tx, booking.id))) {
      throw new NotEligibleForTicketing('no longer CONFIRMED');
    }
    const tickets = await this.creator.forBooking(tx, booking);
    await this.tickets.insertAll(tx, tickets);
    return tickets;
  }

  private async announce(booking: TicketingBooking): Promise<void> {
    try {
      await publishDomainEvent(this.events, {
        type: 'TicketsIssued',
        eventId: `tickets:${booking.id}`,
        bookingId: booking.id,
        ownerId: booking.ownerId,
        ref: booking.reference,
      });
    } catch (error) {
      this.logger.warn(
        { bookingId: booking.id, err: error },
        'Tickets issued, but an observer failed',
      );
    }
  }
}
