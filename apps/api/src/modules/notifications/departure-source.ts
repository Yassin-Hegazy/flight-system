/**
 * A booking's leg with a departure coming up, as the reminder job needs to see it.
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
 * What the reminder job needs to send departure reminders (a port, and the Adapter pattern's
 * Target): it belongs to Notifications, and BookedDeparturesAdapter answers it from the Catalog and
 * Booking, so the reminder rule never sees either.
 */
export interface DepartureSource {
  /**
   * Bookings whose flight departs from `from` to `to`, both inclusive, whatever their status. The
   * reminder job decides which of them to remind.
   */
  ticketedDeparturesBetween(from: Date, to: Date): Promise<UpcomingDeparture[]>;
}

/** Injection token, provided by BookedDeparturesAdapter over the Catalog and Booking. */
export const DEPARTURE_SOURCE = Symbol('DEPARTURE_SOURCE');
