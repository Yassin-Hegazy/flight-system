import type { Tx } from '../../shared/db';
import type { Money } from '../../shared/money';
import type { Cabin } from '../flight-catalog/index';
import type { BookingStatus } from './booking.entity';

/** What Ticketing needs to know about a booking to issue its tickets. */
export interface TicketingBooking {
  id: string;
  reference: string;
  ownerId: string;
  status: BookingStatus;
  /** Everyone travelling, infants included, each with the fare snapshot charged for them. */
  passengers: { id: string; name: string; fare: Money }[];
  /** Every flight in the booking. */
  segments: { id: string; flightId: string; cabin: Cabin }[];
}

/** The part of Booking's public API that Ticketing uses. Booking never calls Ticketing. */
export interface BookingTicketing {
  getForTicketing(bookingId: string): Promise<TicketingBooking | null>;
  /** CONFIRMED → TICKETED inside the issuing transaction; false if the booking has moved on. */
  markTicketed(tx: Tx, bookingId: string): Promise<boolean>;
  ownedId(reference: string, ownerId: string): Promise<string | null>;
  /** Bookings still CONFIRMED, for the ticket-repair job to issue. */
  awaitingTickets(limit: number): Promise<string[]>;
}

export const BOOKING_TICKETING = Symbol('BOOKING_TICKETING');
