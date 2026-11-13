/**
 * What Administration needs to know about bookings to announce a flight change: who to tell
 * (overview, section 2.3: Administration calls Booking). Booking provides this once it exists.
 */
export interface BookingOwners {
  /** Owners of the bookings on this flight that are still active (not expired or cancelled). */
  activeOwnersOf(flightId: string): Promise<string[]>;
}

export const BOOKING_OWNERS = Symbol('BOOKING_OWNERS');

/** Until the Booking module exists there are no bookings, so nobody to tell. */
export class NoBookingsYet implements BookingOwners {
  activeOwnersOf(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
