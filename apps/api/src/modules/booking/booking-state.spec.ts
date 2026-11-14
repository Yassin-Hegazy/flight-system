import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUSES,
  type BookingStatus,
  CancellationWindowClosed,
  type CancelContext,
  InvalidBookingTransition,
  stateFor,
} from './booking-state';

const HOUR = 3_600_000;
const NOW = new Date('2027-01-10T12:00:00Z');
const departsIn = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const traveler = (hours: number): CancelContext => ({
  by: { kind: 'TRAVELER', userId: 'u1' },
  now: NOW,
  departureUtc: departsIn(hours),
});
const airline: CancelContext = { by: { kind: 'AIRLINE' }, now: NOW, departureUtc: null };

type Move = 'confirm' | 'markTicketed' | 'expire' | 'cancel';
const attempt = (status: BookingStatus, move: Move) => {
  const state = stateFor(status);
  return move === 'cancel' ? state.cancel(traveler(48)) : state[move]();
};

describe('Booking lifecycle: the State pattern', () => {
  it('US-BK-02-T01 the six legal transitions succeed', () => {
    expect(attempt('PENDING_PAYMENT', 'confirm').name).toBe('CONFIRMED');
    expect(attempt('PENDING_PAYMENT', 'expire').name).toBe('EXPIRED');
    expect(attempt('PENDING_PAYMENT', 'cancel').name).toBe('CANCELLED');
    expect(attempt('CONFIRMED', 'markTicketed').name).toBe('TICKETED');
    expect(attempt('CONFIRMED', 'cancel').name).toBe('CANCELLED');
    expect(attempt('TICKETED', 'cancel').name).toBe('CANCELLED');
  });

  it('US-BK-02-T01 a repeated cancel returns the same cancelled state', () => {
    const cancelled = stateFor('CANCELLED');
    expect(cancelled.cancel(traveler(1))).toBe(cancelled);
  });

  it('US-BK-02-T01 every other move is rejected with InvalidBookingTransition', () => {
    const legal = new Set([
      'PENDING_PAYMENT:confirm',
      'PENDING_PAYMENT:expire',
      'PENDING_PAYMENT:cancel',
      'CONFIRMED:markTicketed',
      'CONFIRMED:cancel',
      'TICKETED:cancel',
      'CANCELLED:cancel',
    ]);
    const moves: Move[] = ['confirm', 'markTicketed', 'expire', 'cancel'];
    let rejected = 0;
    for (const status of BOOKING_STATUSES) {
      for (const move of moves) {
        if (legal.has(`${status}:${move}`)) continue;
        expect(() => attempt(status, move), `${status} ${move}`).toThrow(InvalidBookingTransition);
        rejected += 1;
      }
    }
    expect(rejected).toBe(13);
  });

  it('US-BK-02-T01 a rejected transition names where it came from', () => {
    expect(() => stateFor('EXPIRED').cancel(traveler(48))).toThrow(
      /EXPIRED booking cannot become CANCELLED/,
    );
  });
});

describe('Cancellation decision table (US-BK-05)', () => {
  it.each(['CONFIRMED', 'TICKETED'] as const)(
    'US-BK-05-T01 a traveler can cancel a %s booking 48 hours before departure',
    (status) => {
      expect(stateFor(status).cancel(traveler(48)).name).toBe('CANCELLED');
    },
  );

  it('US-BK-05-T01 an unpaid booking can always be cancelled, even minutes before departure', () => {
    expect(stateFor('PENDING_PAYMENT').cancel(traveler(0.1)).name).toBe('CANCELLED');
  });

  it.each(['CONFIRMED', 'TICKETED'] as const)(
    'US-BK-05-T02 %s: exactly 24 h 00 min is allowed, 23 h 59 min is rejected',
    (status) => {
      expect(stateFor(status).cancel(traveler(24)).name).toBe('CANCELLED');
      expect(() => stateFor(status).cancel(traveler(24 - 1 / 60))).toThrow(
        CancellationWindowClosed,
      );
    },
  );

  it.each(['CONFIRMED', 'TICKETED'] as const)(
    'US-BK-05-T02 a %s booking cannot be cancelled by the traveler after departure',
    (status) => {
      expect(() => stateFor(status).cancel(traveler(-1))).toThrow(CancellationWindowClosed);
    },
  );

  it.each(['PENDING_PAYMENT', 'CONFIRMED', 'TICKETED'] as const)(
    'US-BK-08-T02 the airline can cancel a %s booking whatever the time',
    (status) => {
      expect(stateFor(status).cancel(airline).name).toBe('CANCELLED');
    },
  );

  it('US-BK-05-T02 an expired booking cannot be cancelled by anyone', () => {
    expect(() => stateFor('EXPIRED').cancel(airline)).toThrow(InvalidBookingTransition);
  });
});
