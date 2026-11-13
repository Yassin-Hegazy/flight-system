import { randomUUID } from 'node:crypto';
import type {
  BookingCancelled,
  BookingConfirmed,
  BookingExpired,
  FlightCancelled,
  FlightDelayed,
  TicketsIssued,
} from '../../shared/events';
import type { Clock } from '../../shared/time';

export const ALICE = '11111111-1111-4111-8111-111111111111';
export const BOB = '22222222-2222-4222-8222-222222222222';
export const CARA = '33333333-3333-4333-8333-333333333333';

/** A clock the test moves by hand. */
export class ManualClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

type BookingEvent = BookingConfirmed | TicketsIssued | BookingExpired;

/** A booking event of the given type; override any field. */
export function bookingEvent<T extends BookingEvent['type']>(
  type: T,
  overrides: Partial<Extract<BookingEvent, { type: T }>> = {},
): Extract<BookingEvent, { type: T }> {
  return {
    type,
    eventId: randomUUID(),
    bookingId: randomUUID(),
    ownerId: ALICE,
    ref: 'K7M2QP',
    ...overrides,
  } as Extract<BookingEvent, { type: T }>;
}

export function bookingCancelled(overrides: Partial<BookingCancelled> = {}): BookingCancelled {
  return {
    type: 'BookingCancelled',
    eventId: randomUUID(),
    bookingId: randomUUID(),
    ownerId: ALICE,
    ref: 'K7M2QP',
    reason: 'TRAVELER',
    ...overrides,
  };
}

export function flightDelayed(overrides: Partial<FlightDelayed> = {}): FlightDelayed {
  return {
    type: 'FlightDelayed',
    eventId: randomUUID(),
    flightId: randomUUID(),
    flightNumber: 'MS123',
    departureTimeZone: 'Africa/Cairo',
    oldDepartureUtc: '2026-12-10T07:00:00.000Z',
    newDepartureUtc: '2026-12-10T09:30:00.000Z',
    affectedUserIds: [ALICE, BOB],
    ...overrides,
  };
}

export function flightCancelled(overrides: Partial<FlightCancelled> = {}): FlightCancelled {
  return {
    type: 'FlightCancelled',
    eventId: randomUUID(),
    flightId: randomUUID(),
    flightNumber: 'MS123',
    departureTimeZone: 'Africa/Cairo',
    departureUtc: '2026-12-10T07:00:00.000Z',
    affectedUserIds: [ALICE, BOB],
    ...overrides,
  };
}
