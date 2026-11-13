import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BOOKING_TICKET_VOID_IN_TX, type BookingCancellationInTx } from '../../shared/events';
import { TicketsRepository } from './tickets.repository';

/**
 * US-TK-03: a cancelled booking never keeps a valid ticket. This runs inside the cancellation's
 * transaction, so if voiding fails the booking is not cancelled either.
 */
@Injectable()
export class VoidTickets {
  constructor(private readonly tickets: TicketsRepository) {}

  @OnEvent(BOOKING_TICKET_VOID_IN_TX, { suppressErrors: false })
  async onCancellation({ tx, bookingId }: BookingCancellationInTx): Promise<void> {
    await this.tickets.voidForBooking(tx, bookingId);
  }
}
