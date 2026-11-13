import { Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import type { Ticket } from './ticket';

/** Stores tickets. Only Ticketing reads or writes the tickets table. */
@Injectable()
export class TicketsRepository {
  findByBooking(bookingId: string): Promise<Ticket[]> {
    void bookingId;
    return Promise.reject(new Error('Not implemented'));
  }

  insertAll(tx: Tx, tickets: readonly Ticket[]): Promise<void> {
    void [tx, tickets];
    return Promise.reject(new Error('Not implemented'));
  }
}
