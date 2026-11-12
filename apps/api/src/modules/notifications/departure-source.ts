/**
 * A booking with a departure coming up, as the reminder job needs to see it. Notifications cannot
 * query Booking, so Booking describes what it knows in this shape instead.
 */
export interface UpcomingDeparture {
  bookingId: string;
  /** The traveler to remind. */
  ownerId: string;
  /** The public booking reference. Messages name this, never passenger details. */
  ref: string;
  flightNumber: string;
  departureUtc: string;
  /** IANA time zone of the departure airport, to show the departure as local time. */
  departureTimeZone: string;
  /** Only TICKETED bookings are reminded: those travelers are actually flying. */
  bookingStatus: string;
  /** A CANCELLED flight is never reminded. */
  flightStatus: string;
}

/**
 * What Notifications needs from the Booking module to send departure reminders (a port: the
 * interface belongs to Notifications and Booking provides the implementation, so Notifications
 * imports nothing from Booking).
 */
export interface DepartureSource {
  /**
   * Bookings whose flight departs from `from` to `to`, both inclusive, whatever their status. The
   * reminder job decides which of them to remind.
   */
  ticketedDeparturesBetween(from: Date, to: Date): Promise<UpcomingDeparture[]>;
}

/** Injection token. The Booking owner replaces the default provider in notifications.module.ts. */
export const DEPARTURE_SOURCE = Symbol('DEPARTURE_SOURCE');

/** The default until Booking provides a real source: there is nothing to remind anyone about. */
export class NoDepartureSource implements DepartureSource {
  ticketedDeparturesBetween(): Promise<UpcomingDeparture[]> {
    return Promise.resolve([]);
  }
}
