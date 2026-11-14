import type { Tx } from '../../shared/db';

export interface EligibleBooking {
  id: string;
  reference: string;
  ownerId: string;
  flightId: string;
  passengerCount: number;
}

/** The part of Booking's API that Ticketing calls (Booking pack, section 2). */
export interface BookingTicketing {
  /** A paid (CONFIRMED) booking, or null when it is missing or not eligible for tickets. */
  getForTicketing(bookingId: string): Promise<EligibleBooking | null>;
  /** CONFIRMED becomes TICKETED inside the caller's transaction. */
  markTicketed(tx: Tx, bookingId: string): Promise<void>;
}

export const BOOKING_TICKETING = Symbol('BOOKING_TICKETING');
