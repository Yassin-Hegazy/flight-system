import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import { CLOCK, type Clock } from '../../shared/time';
import type { TicketingBooking } from '../booking/index';
import type { NewTicket, Ticket } from './ticket';

/** Hands out ticket numbers; a database sequence in production, a counter in unit tests. */
export interface TicketNumberGenerator {
  next(tx: Tx): Promise<string>;
}

export const TICKET_NUMBERS = Symbol('TICKET_NUMBERS');

/** Everything a ticket needs except its number and issue time. */
export type TicketDraft = Omit<NewTicket, 'number' | 'issuedAt'>;

export class NotEligibleForTicketing extends Error {
  constructor(readonly status: string) {
    super(`A ${status} booking cannot be ticketed`);
    this.name = 'NotEligibleForTicketing';
  }
}

/** Every (passenger, segment) pair becomes one ticket draft. */
export function draftsFor(booking: TicketingBooking): TicketDraft[] {
  void booking;
  return [];
}

/** Factory Method, Creator. */
export abstract class TicketCreator {
  constructor(
    private readonly numbers: TicketNumberGenerator,
    private readonly clock: Clock,
  ) {}

  /** The factory method. */
  protected abstract createTicket(draft: TicketDraft, number: string, issuedAt: Date): Ticket;

  /** The lecture's SomeOperation. */
  forBooking(tx: Tx, booking: TicketingBooking): Promise<Ticket[]> {
    void [tx, booking, this.numbers, this.clock];
    return Promise.reject(new Error('Not implemented'));
  }
}

/** Factory Method, ConcreteCreator. */
@Injectable()
export class ETicketCreator extends TicketCreator {
  constructor(@Inject(TICKET_NUMBERS) numbers: TicketNumberGenerator, @Inject(CLOCK) clock: Clock) {
    super(numbers, clock);
  }

  protected createTicket(draft: TicketDraft, number: string, issuedAt: Date): Ticket {
    void [draft, number, issuedAt];
    throw new Error('Not implemented');
  }
}
