import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import { CLOCK, type Clock } from '../../shared/time';
import type { TicketingBooking } from '../booking/index';
import { ETicket, type NewTicket, type Ticket } from './ticket';

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
  return booking.segments.flatMap((segment) =>
    booking.passengers.map((passenger) => ({
      bookingId: booking.id,
      passengerId: passenger.id,
      passengerName: passenger.name,
      segmentId: segment.id,
      flightId: segment.flightId,
      cabin: segment.cabin,
      fare: passenger.fare,
    })),
  );
}

/** Factory Method, Creator. */
export abstract class TicketCreator {
  constructor(
    private readonly numbers: TicketNumberGenerator,
    private readonly clock: Clock,
  ) {}

  /** The factory method: which kind of ticket to build is the subclass's decision. */
  protected abstract createTicket(draft: TicketDraft, number: string, issuedAt: Date): Ticket;

  /**
   * The lecture's SomeOperation: the rules every kind of ticket shares. Only a CONFIRMED booking
   * is ticketed, it gets one ticket per passenger per flight, and every number comes from the
   * generator inside the issuing transaction.
   */
  async forBooking(tx: Tx, booking: TicketingBooking): Promise<Ticket[]> {
    if (booking.status !== 'CONFIRMED') throw new NotEligibleForTicketing(booking.status);
    const issuedAt = this.clock.now();
    const tickets: Ticket[] = [];
    // One at a time, so numbers follow passenger and segment order.
    for (const draft of draftsFor(booking)) {
      tickets.push(this.createTicket(draft, await this.numbers.next(tx), issuedAt));
    }
    return tickets;
  }
}

/** Factory Method, ConcreteCreator. */
@Injectable()
export class ETicketCreator extends TicketCreator {
  constructor(@Inject(TICKET_NUMBERS) numbers: TicketNumberGenerator, @Inject(CLOCK) clock: Clock) {
    super(numbers, clock);
  }

  protected createTicket(draft: TicketDraft, number: string, issuedAt: Date): Ticket {
    return new ETicket({ ...draft, number, issuedAt });
  }
}
