import type { EventEmitter2 } from '@nestjs/event-emitter';
import { QueryFailedError } from 'typeorm';
import type { Tx } from '../../shared/db';
import { money } from '../../shared/money';
import type { BookingTicketing, EligibleBooking } from '../booking/index';
import { IssueTickets } from './issue-tickets';
import type { Ticket } from './ticket';
import { ETicketCreator, type TicketNumberGenerator } from './ticket-creator';
import type { TicketsRepository } from './tickets.repository';

export const TX = { fake: 'transaction' } as unknown as Tx;
export const ISSUED_AT = new Date('2027-03-01T10:00:00Z');
export const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
export const OWNER = '11111111-1111-4111-8111-111111111111';
export const OUTBOUND = 'f0000000-0000-4000-8000-000000000001';
export const RETURN = 'f0000000-0000-4000-8000-000000000002';

/** Numbers 9990000000001, 9990000000002, ... in the order they are asked for. */
export class CountingNumbers implements TicketNumberGenerator {
  private last = 0;
  readonly asked: Tx[] = [];

  next(tx: Tx): Promise<string> {
    this.asked.push(tx);
    this.last += 1;
    return Promise.resolve(`999${String(this.last).padStart(10, '0')}`);
  }
}

export const creator = (numbers = new CountingNumbers()) =>
  new ETicketCreator(numbers, { now: () => ISSUED_AT });

const adult = (id: string, name: string) => ({ id, name, fare: money(1_500_000, 'EGP') });

/** A booking for Ticketing; one adult on one Economy flight unless the test says otherwise. */
export function booking(fields: Partial<EligibleBooking> = {}): EligibleBooking {
  return {
    id: BOOKING_ID,
    reference: 'K7M2QP',
    ownerId: OWNER,
    status: 'CONFIRMED',
    passengers: [adult('p-1', 'Mona Adel')],
    segments: [{ id: 's-1', flightId: OUTBOUND, cabin: 'ECONOMY' }],
    ...fields,
  };
}

export const family = () => [
  adult('p-1', 'Mona Adel'),
  adult('p-2', 'Karim Adel'),
  { id: 'p-3', name: 'Laila Adel', fare: money(150_000, 'EGP') },
];

export const roundTrip = () => [
  { id: 's-1', flightId: OUTBOUND, cabin: 'ECONOMY' as const },
  { id: 's-2', flightId: RETURN, cabin: 'ECONOMY' as const },
];

function uniqueViolation() {
  return new QueryFailedError('INSERT INTO tickets', [], { code: '23505' } as unknown as Error);
}

/**
 * The tickets table in memory. insertAll refuses a repeated number or a repeated
 * (booking, passenger, segment), as the unique constraints do in PostgreSQL.
 */
export class InMemoryTickets {
  readonly rows: Ticket[] = [];

  findByBooking(bookingId: string): Promise<Ticket[]> {
    return Promise.resolve(this.rows.filter((row) => row.bookingId === bookingId));
  }

  findByNumber(number: string): Promise<Ticket | null> {
    return Promise.resolve(this.rows.find((row) => row.number === number) ?? null);
  }

  insertAll(_tx: Tx, tickets: readonly Ticket[]): Promise<void> {
    const clash = tickets.some((ticket) =>
      this.rows.some(
        (row) =>
          row.number === ticket.number ||
          (row.bookingId === ticket.bookingId &&
            row.passengerId === ticket.passengerId &&
            row.segmentId === ticket.segmentId),
      ),
    );
    if (clash) return Promise.reject(uniqueViolation());
    this.rows.push(...tickets);
    return Promise.resolve();
  }
}

/** Booking's side: answers getForTicketing and records markTicketed. */
export class FakeBooking implements BookingTicketing {
  marked: { tx: Tx; bookingId: string }[] = [];
  /** What markTicketed answers: false when the booking has moved on, e.g. been cancelled. */
  markResult = true;

  constructor(public current: EligibleBooking | null = booking()) {}

  getForTicketing(): Promise<EligibleBooking | null> {
    return Promise.resolve(this.current);
  }

  markTicketed(tx: Tx, bookingId: string): Promise<boolean> {
    this.marked.push({ tx, bookingId });
    return Promise.resolve(this.markResult);
  }

  ownedId(): Promise<string | null> {
    return Promise.resolve(this.current?.id ?? null);
  }

  awaitingTickets(): Promise<string[]> {
    return Promise.resolve(this.current?.status === 'CONFIRMED' ? [this.current.id] : []);
  }
}

/** IssueTickets over in-memory doubles; the log records begin, commit, rollback and publish. */
export function issueFixture(current: EligibleBooking | null = booking()) {
  const log: string[] = [];
  const db = {
    transaction: async (_isolation: string, work: (tx: Tx) => Promise<unknown>) => {
      log.push('begin');
      try {
        const value = await work(TX);
        log.push('commit');
        return value;
      } catch (error) {
        log.push('rollback');
        throw error;
      }
    },
  };
  const events = {
    emitAsync: (type: string, event: { eventId: string }) => {
      log.push(`publish ${type} ${event.eventId}`);
      return Promise.resolve([]);
    },
  } as unknown as EventEmitter2;
  const tickets = new InMemoryTickets();
  const bookings = new FakeBooking(current);
  const issue = new IssueTickets(
    db as never,
    bookings,
    tickets as unknown as TicketsRepository,
    creator(),
    events,
  );
  return { issue, tickets, bookings, log };
}
