import type { Money } from '../../shared/money';
import type { Cabin } from '../flight-catalog/index';

export type TicketStatus = 'VALID' | 'VOID';

/** 13 digits: a 3-digit prefix, then a 10-digit number from a database sequence. */
export const TICKET_NUMBER = /^\d{13}$/;

/** Factory Method, IProduct: one passenger's proof of travel on one flight. */
export interface Ticket {
  readonly number: string;
  readonly bookingId: string;
  readonly passengerId: string;
  readonly passengerName: string;
  readonly segmentId: string;
  readonly flightId: string;
  readonly cabin: Cabin;
  readonly fare: Money;
  readonly status: TicketStatus;
  readonly issuedAt: Date;
  readonly voidedAt: Date | null;
}

export type NewTicket = Omit<Ticket, 'status' | 'voidedAt'>;

/** Factory Method, ConcreteProduct: an electronic ticket, VALID when issued. */
export class ETicket implements Ticket {
  readonly number!: string;
  readonly bookingId!: string;
  readonly passengerId!: string;
  readonly passengerName!: string;
  readonly segmentId!: string;
  readonly flightId!: string;
  readonly cabin!: Cabin;
  readonly fare!: Money;
  readonly status: TicketStatus = 'VALID';
  readonly issuedAt!: Date;
  readonly voidedAt: Date | null = null;

  constructor(fields: NewTicket) {
    void fields;
    throw new Error('Not implemented');
  }
}
