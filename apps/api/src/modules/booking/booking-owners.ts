import type { Tx } from '../../shared/db';

/** The part of Booking's public API used to announce a flight change. */
export interface BookingOwners {
  /** Owners of the bookings on this flight that are still active (not expired or cancelled). */
  activeOwnersOf(tx: Tx, flightId: string): Promise<string[]>;
}

export const BOOKING_OWNERS = Symbol('BOOKING_OWNERS');
