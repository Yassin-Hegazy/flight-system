import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Result } from '../../shared/result';
import { BOOKING_TICKETING, type BookingTicketing } from '../booking/index';
import type { Ticket } from './ticket';
import { TicketCreator } from './ticket-creator';
import { TicketsRepository } from './tickets.repository';

export type IssueError = 'NOT_FOUND' | 'NOT_ELIGIBLE';

/** US-TK-01: issues a confirmed booking's tickets once, however often it is asked. */
@Injectable()
export class IssueTickets {
  constructor(
    @InjectDataSource() private readonly db: Pick<DataSource, 'transaction'>,
    @Inject(BOOKING_TICKETING) private readonly booking: BookingTicketing,
    private readonly tickets: TicketsRepository,
    private readonly creator: TicketCreator,
    private readonly events: EventEmitter2,
  ) {}

  execute(bookingId: string): Promise<Result<Ticket[], IssueError>> {
    void [bookingId, this.db, this.booking, this.tickets, this.creator, this.events];
    return Promise.reject(new Error('Not implemented'));
  }
}
