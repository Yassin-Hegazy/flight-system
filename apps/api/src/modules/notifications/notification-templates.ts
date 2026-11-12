import type { DomainEvent, DomainEventType, EventOf } from '../../shared/events';
import type { UpcomingDeparture } from './departure-source';
import { formatLocal, isValidTimeZone } from '../../shared/time';

/** What an event turns into: who is told, and what they read. */
export interface NotificationDraft {
  to: readonly string[];
  title: string;
  body: string;
  /** An app-relative path, or null when there is nothing specific to open. */
  link: string | null;
}

type Template<T extends DomainEventType> = (event: EventOf<T>) => NotificationDraft | null;

/** One message to the booking's owner, linking to the booking. */
function mine(
  event: { ownerId: string; ref: string },
  title: string,
  body: string,
): NotificationDraft {
  return { to: [event.ownerId], title, body, link: `/bookings/${event.ref}` };
}

/**
 * A departure as the traveler will read it at the airport: local time with its UTC offset. An
 * unknown time zone falls back to UTC rather than losing the notification.
 */
function localTime(instantUtc: string, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return formatLocal(new Date(instantUtc), zone).replace('T', ' ');
}

/**
 * Declarative: which message each event produces. A lookup has no order, so it is a table; adding
 * an event type is adding one row. Messages carry the booking reference or flight number only,
 * never passenger or payment details (NFR-PRIV-01).
 *
 * A template returns null when the event needs no message of its own.
 */
export const TEMPLATES: { readonly [T in DomainEventType]: Template<T> } = {
  BookingConfirmed: (e) =>
    mine(e, `Booking ${e.ref} confirmed`, `Your booking ${e.ref} is confirmed.`),

  TicketsIssued: (e) =>
    mine(
      e,
      `Tickets for ${e.ref} are ready`,
      `Your tickets for booking ${e.ref} have been issued.`,
    ),

  BookingExpired: (e) =>
    mine(
      e,
      `Booking ${e.ref} expired unpaid`,
      `Booking ${e.ref} was not paid in time, so the held seats were released.`,
    ),

  BookingCancelled: (e) =>
    // An airline cancellation is announced once, by FlightCancelled; a second message here would
    // tell every traveler the same thing twice.
    e.reason === 'AIRLINE'
      ? null
      : mine(e, `Booking ${e.ref} cancelled`, `Your booking ${e.ref} has been cancelled.`),

  FlightDelayed: (e) => ({
    to: e.affectedUserIds,
    title: `Flight ${e.flightNumber} delayed`,
    body:
      `Flight ${e.flightNumber} is delayed. ` +
      `Original departure: ${localTime(e.oldDepartureUtc, e.departureTimeZone)}. ` +
      `New departure: ${localTime(e.newDepartureUtc, e.departureTimeZone)}. ` +
      'Times are local to the departure airport.',
    link: null,
  }),

  FlightCancelled: (e) => ({
    to: e.affectedUserIds,
    title: `Flight ${e.flightNumber} cancelled`,
    body:
      `Flight ${e.flightNumber}, scheduled to depart ` +
      `${localTime(e.departureUtc, e.departureTimeZone)} (local to the departure airport), ` +
      'has been cancelled. Your booking is cancelled. Any payment will be refunded in full.',
    link: null,
  }),
};

/** The event types Notifications observes: exactly the ones with a template. */
export const NOTIFIED_EVENT_TYPES = Object.keys(TEMPLATES) as DomainEventType[];

/** The message an event produces, or null when it produces none. */
export function draftFor(event: DomainEvent): NotificationDraft | null {
  const template = TEMPLATES[event.type] as (event: DomainEvent) => NotificationDraft | null;
  return template(event);
}

/** The reminder sent the day before a flight (US-NT-06). It is created by a scheduled job, not by an event. */
export function reminderDraft(departure: UpcomingDeparture): NotificationDraft {
  const when = localTime(departure.departureUtc, departure.departureTimeZone);
  return {
    to: [departure.ownerId],
    title: `Flight ${departure.flightNumber} departs tomorrow`,
    body: `Booking ${departure.ref}: flight ${departure.flightNumber} departs ${when} (local to the departure airport).`,
    link: `/bookings/${departure.ref}`,
  };
}

/** Every type a notification can have: the six events Notifications observes, plus the reminder. */
export const NOTIFICATION_TYPES = [...NOTIFIED_EVENT_TYPES, 'DepartureReminder'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
