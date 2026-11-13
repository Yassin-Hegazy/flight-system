import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Tx } from '../../shared/db';
import {
  BOOKING_TICKET_VOID_IN_TX,
  BOOKING_TICKET_ISSUE_IN_TX,
  type BookingTicketIssueInTx,
  type BookingCancellationInTx,
  type BookingConfirmed,
  publishDomainEvent,
} from '../../shared/events';
import { TicketEntity } from './ticket.entity';

@Injectable()
export class FlightTickets {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(BOOKING_TICKET_ISSUE_IN_TX, { suppressErrors: false })
  async issue({ tx, bookingId, flightId }: BookingTicketIssueInTx): Promise<void> {
    await tx
      .createQueryBuilder()
      .insert()
      .into(TicketEntity)
      .values({ bookingId, flightId, status: 'ISSUED' })
      .orIgnore()
      .execute();
  }

  @OnEvent('BookingConfirmed')
  async afterConfirmation(confirmed: BookingConfirmed): Promise<void> {
    const issued = await this.db.manager.findOneBy(TicketEntity, {
      bookingId: confirmed.bookingId,
      status: 'ISSUED',
    });
    if (issued) {
      await publishDomainEvent(this.events, {
        ...confirmed,
        type: 'TicketsIssued',
        eventId: issued.number,
      });
    }
  }

  @OnEvent(BOOKING_TICKET_VOID_IN_TX, { suppressErrors: false })
  async void({ tx, bookingId }: BookingCancellationInTx): Promise<void> {
    await tx.update(TicketEntity, { bookingId, status: 'ISSUED' }, { status: 'VOID' });
  }

  async forFlight(tx: Tx, flightId: string) {
    return tx.findBy(TicketEntity, { flightId });
  }
}
