import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Tx } from '../../shared/db';
import { money } from '../../shared/money';
import type { Ticket } from './ticket';
import { TicketEntity } from './ticket.entity';

function toTicket(row: TicketEntity): Ticket {
  const { fareMinor, currency, ...fields } = row;
  return { ...fields, fare: money(fareMinor, currency) };
}

/** Stores tickets. Only Ticketing reads or writes the tickets table. */
@Injectable()
export class TicketsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async findByBooking(bookingId: string): Promise<Ticket[]> {
    const rows = await this.db.manager.find(TicketEntity, {
      where: { bookingId },
      order: { number: 'ASC' },
    });
    return rows.map(toTicket);
  }

  async findByNumber(number: string): Promise<Ticket | null> {
    const row = await this.db.manager.findOneBy(TicketEntity, { number });
    return row ? toTicket(row) : null;
  }

  /** The unique keys on number and (booking, passenger, segment) reject a racing duplicate. */
  async insertAll(tx: Tx, tickets: readonly Ticket[]): Promise<void> {
    if (tickets.length === 0) return;
    await tx.insert(
      TicketEntity,
      tickets.map(({ fare, ...fields }) => ({
        ...fields,
        fareMinor: fare.amountMinor,
        currency: fare.currency,
      })),
    );
  }

  /** Voids the booking's valid tickets; already-void tickets keep their voidedAt. */
  async voidForBooking(tx: Tx, bookingId: string): Promise<number> {
    const result = await tx.update(
      TicketEntity,
      { bookingId, status: 'VALID' },
      { status: 'VOID', voidedAt: () => 'now()' },
    );
    return result.affected ?? 0;
  }

  async forFlight(tx: Tx, flightId: string): Promise<Ticket[]> {
    const rows = await tx.find(TicketEntity, { where: { flightId }, order: { number: 'ASC' } });
    return rows.map(toTicket);
  }
}
