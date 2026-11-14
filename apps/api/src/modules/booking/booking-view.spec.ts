import { describe, expect, it } from 'vitest';
import type { BookingHistoryEntity } from './booking-history.entity';
import type { BookingPassengerEntity } from './booking-passenger.entity';
import type { BookingStatus } from './booking-state';
import { toView } from './booking-view';
import type { BookingEntity } from './booking.entity';

const EXPIRES = new Date('2027-01-10T12:15:00Z');
const booking = (status: BookingStatus): BookingEntity => ({
  id: 'b1',
  reference: 'K7M2QP',
  ownerId: 'u1',
  passengerName: 'Sara Hassan',
  flightId: 'f1',
  cabin: 'ECONOMY',
  holdId: 'h1',
  amountMinor: 2_625_000,
  currency: 'EGP',
  status,
  paymentId: status === 'CONFIRMED' || status === 'TICKETED' ? 'p1' : null,
  expiresAt: EXPIRES,
  cancelReason: status === 'CANCELLED' ? 'TRAVELER' : null,
});
const passengers = [
  {
    id: 'p2',
    position: 1,
    firstName: 'Omar',
    lastName: 'Hassan',
    birthDate: '2018-03-01',
    type: 'CHILD',
    fareMinor: 1_125_000,
    currency: 'EGP',
  },
  {
    id: 'p1',
    position: 0,
    firstName: 'Sara',
    lastName: 'Hassan',
    birthDate: '1990-05-01',
    type: 'ADULT',
    fareMinor: 1_500_000,
    currency: 'EGP',
  },
] as BookingPassengerEntity[];
const history = [
  {
    id: 2,
    bookingId: 'b1',
    fromStatus: 'PENDING_PAYMENT',
    toStatus: 'CONFIRMED',
    cause: 'PAYMENT',
    at: new Date('2027-01-10T12:05:00Z'),
  },
  {
    id: 1,
    bookingId: 'b1',
    fromStatus: null,
    toStatus: 'PENDING_PAYMENT',
    cause: 'CREATED',
    at: new Date('2027-01-10T12:00:00Z'),
  },
] as BookingHistoryEntity[];

describe('Booking view mapper (US-BK-04 AC-1)', () => {
  it('US-BK-04-T01 a pending booking shows its hold expiry', () => {
    expect(toView(booking('PENDING_PAYMENT'), passengers, history).expiresAt).toBe(
      EXPIRES.toISOString(),
    );
  });

  it.each(['CONFIRMED', 'TICKETED', 'EXPIRED', 'CANCELLED'] as const)(
    'US-BK-04-T01 a %s booking shows no hold expiry',
    (status) => {
      expect(toView(booking(status), passengers, history).expiresAt).toBeNull();
    },
  );

  it('US-BK-04-T01 shows reference, status, flight, total and passengers in order', () => {
    const view = toView(booking('CONFIRMED'), passengers, history);
    expect(view).toMatchObject({
      reference: 'K7M2QP',
      status: 'CONFIRMED',
      flightId: 'f1',
      cabin: 'ECONOMY',
      amount: { amountMinor: 2_625_000, currency: 'EGP' },
    });
    expect(view.passengers.map((p) => p.firstName)).toEqual(['Sara', 'Omar']);
  });

  it('US-BK-03-T01 the passenger fares in the snapshot add up to the total', () => {
    const view = toView(booking('CONFIRMED'), passengers, history);
    const sum = view.passengers.reduce((total, p) => total + p.fare.amountMinor, 0);
    expect(sum).toBe(view.amount.amountMinor);
  });

  it('US-BK-02-T02 the history is shown oldest first with its causes', () => {
    const view = toView(booking('CONFIRMED'), passengers, history);
    expect(view.history.map((h) => [h.from, h.to, h.cause])).toEqual([
      [null, 'PENDING_PAYMENT', 'CREATED'],
      ['PENDING_PAYMENT', 'CONFIRMED', 'PAYMENT'],
    ]);
  });
});
