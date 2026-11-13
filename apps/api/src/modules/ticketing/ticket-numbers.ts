import { Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import type { TicketNumberGenerator } from './ticket-creator';

/** Like an airline's code on a real e-ticket; 999 is not assigned to any airline. */
const PREFIX = '999';

/** 13-digit ticket numbers from a PostgreSQL sequence, which never repeats a value. */
@Injectable()
export class SequenceTicketNumbers implements TicketNumberGenerator {
  async next(tx: Tx): Promise<string> {
    const [row] = await tx.query<{ value: string }[]>(
      `SELECT nextval('ticket_number_seq')::text AS value`,
    );
    return PREFIX + row.value.padStart(10, '0');
  }
}
