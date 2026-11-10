import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/events';
import { NOTIFIED_EVENT_TYPES, draftFor } from './notification-templates';
import {
  ALICE,
  BOB,
  bookingCancelled,
  bookingEvent,
  flightCancelled,
  flightDelayed,
} from './test-support';

describe('US-NT-01 Get booking notifications (templates)', () => {
  it('US-NT-01-T01 BookingConfirmed tells only the owner, naming the booking reference', () => {
    const draft = draftFor(bookingEvent('BookingConfirmed', { ownerId: ALICE, ref: 'K7M2QP' }));

    expect(draft).toEqual({
      to: [ALICE],
      title: 'Booking K7M2QP confirmed',
      body: 'Your booking K7M2QP is confirmed.',
      link: '/bookings/K7M2QP',
    });
  });

  it('US-NT-01-T01 TicketsIssued tells the owner the tickets are ready', () => {
    const draft = draftFor(bookingEvent('TicketsIssued', { ref: 'K7M2QP' }));

    expect(draft).toMatchObject({ to: [ALICE], title: 'Tickets for K7M2QP are ready' });
  });

  it('US-NT-01-T01 BookingExpired tells the owner the booking expired unpaid', () => {
    const draft = draftFor(bookingEvent('BookingExpired', { ref: 'K7M2QP' }));

    expect(draft).toMatchObject({ to: [ALICE], title: 'Booking K7M2QP expired unpaid' });
  });

  it('US-NT-01-T01 a traveler cancelling a booking is told it was cancelled', () => {
    const draft = draftFor(bookingCancelled({ reason: 'TRAVELER', ref: 'K7M2QP' }));

    expect(draft).toMatchObject({ to: [ALICE], title: 'Booking K7M2QP cancelled' });
  });

  it('US-NT-01-T02 an airline cancellation creates nothing here: FlightCancelled announces it', () => {
    expect(draftFor(bookingCancelled({ reason: 'AIRLINE' }))).toBeNull();
  });
});

describe('US-NT-02 Get flight status notifications (templates)', () => {
  it('US-NT-02-T02 a delay shows the old and new departure in the airport’s local time', () => {
    // Cairo is UTC+2 in December.
    const draft = draftFor(
      flightDelayed({
        flightNumber: 'MS123',
        departureTimeZone: 'Africa/Cairo',
        oldDepartureUtc: '2026-12-10T07:00:00.000Z',
        newDepartureUtc: '2026-12-10T09:30:00.000Z',
      }),
    );

    expect(draft?.title).toBe('Flight MS123 delayed');
    expect(draft?.body).toContain('Original departure: 2026-12-10 09:00+02:00');
    expect(draft?.body).toContain('New departure: 2026-12-10 11:30+02:00');
  });

  it('US-NT-02-T02 the local time follows the airport’s zone, not the server’s', () => {
    // New York is UTC-5 in December: the same instants read differently there.
    const draft = draftFor(flightDelayed({ departureTimeZone: 'America/New_York' }));

    expect(draft?.body).toContain('Original departure: 2026-12-10 02:00-05:00');
    expect(draft?.body).toContain('New departure: 2026-12-10 04:30-05:00');
  });

  it('US-NT-02-T02 an unknown time zone falls back to UTC instead of losing the message', () => {
    const draft = draftFor(flightDelayed({ departureTimeZone: 'Not/AZone' }));

    expect(draft?.body).toContain('Original departure: 2026-12-10 07:00+00:00');
  });

  it('US-NT-02-T01 a delay and a cancellation are addressed to the affected owners only', () => {
    expect(draftFor(flightDelayed({ affectedUserIds: [ALICE, BOB] }))?.to).toEqual([ALICE, BOB]);
    expect(draftFor(flightCancelled({ affectedUserIds: [BOB] }))?.to).toEqual([BOB]);
  });

  it('US-NT-02-T01 a cancellation names the flight, its local departure and the refund', () => {
    const draft = draftFor(flightCancelled({ flightNumber: 'MS123' }));

    expect(draft?.title).toBe('Flight MS123 cancelled');
    expect(draft?.body).toContain('2026-12-10 09:00+02:00');
    expect(draft?.body).toContain('refunded in full');
  });
});

describe('NFR-PRIV-01 messages carry the reference, not personal or internal data', () => {
  it('NFR-PRIV-01-T01 no message contains user or booking IDs, only the booking reference', () => {
    const events: DomainEvent[] = [
      bookingEvent('BookingConfirmed'),
      bookingEvent('TicketsIssued'),
      bookingEvent('BookingExpired'),
      bookingCancelled(),
      flightDelayed(),
      flightCancelled(),
    ];

    for (const event of events) {
      // What the traveler reads; the recipient list is routing data, not message content.
      const { title, body, link } = draftFor(event)!;
      const text = JSON.stringify({ title, body, link });
      expect(text).not.toContain(ALICE);
      expect(text).not.toContain(BOB);
      if ('bookingId' in event) expect(text).not.toContain(event.bookingId);
    }
  });
});

describe('Observer wiring', () => {
  it('observes exactly the six event types Notifications has a message for', () => {
    expect([...NOTIFIED_EVENT_TYPES].sort()).toEqual([
      'BookingCancelled',
      'BookingConfirmed',
      'BookingExpired',
      'FlightCancelled',
      'FlightDelayed',
      'TicketsIssued',
    ]);
  });
});
