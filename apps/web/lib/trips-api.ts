import { api } from './api';
import type { Booking, Cabin, Payment } from './booking-api';
import type { Money } from './search-api';

export interface BookingSummary {
  reference: string;
  route: { origin: string; destination: string };
  departureLocal: string;
  status: string;
  total: Money;
}

export interface StatusChange {
  from: string | null;
  to: string;
  cause: string;
  /** An instant (UTC), not an airport-local time. */
  at: string;
}

export type BookingDetail = Booking & { history: StatusChange[] };

export interface Receipt extends Payment {
  createdAt: string;
  resolvedAt: string | null;
  refund: { status: string; amount: Money; resolvedAt: string | null } | null;
}

export interface Ticket {
  ticketNumber: string;
  status: string;
  bookingReference: string;
  passengerName: string;
  cabin: Cabin;
  flight: {
    flightNumber: string;
    airline: { code: string; name: string };
    origin: { code: string; city: string };
    destination: { code: string; city: string };
    scheduledDepartureLocal: string;
    scheduledArrivalLocal: string;
    status: string;
  };
  issuedAt: string;
}

/** The printable e-ticket for one passenger on one flight. */
export interface ETicket {
  ticketNumber: string;
  status: string;
  /** "VOID" once the ticket no longer entitles anyone to travel. */
  voidMarking: string | null;
  passengerName: string;
  bookingReference: string;
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
  departureLocal: string;
  arrivalLocal: string;
  cabin: Cabin;
}

const LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  TICKETED: 'Ticketed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  VALID: 'Valid',
  VOID: 'Void',
  SUCCEEDED: 'Succeeded',
  PENDING: 'Pending',
  FAILED: 'Failed',
};

/** A status in words: "PENDING_PAYMENT" → "Awaiting payment". Unknown ones are just tidied up. */
export function statusLabel(status: string): string {
  const tidy = status.replaceAll('_', ' ').toLowerCase();
  return LABELS[status] ?? tidy.charAt(0).toUpperCase() + tidy.slice(1);
}

/** While a booking is in one of these the traveler may still cancel it. */
export const CANCELLABLE = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'TICKETED']);

const path = (reference: string) => `/bookings/${encodeURIComponent(reference)}`;

/** Expired bookings (held, never paid) are left out unless asked for. */
export const listBookings = (includeExpired = false) =>
  api<{ upcoming: BookingSummary[]; past: BookingSummary[] }>(
    includeExpired ? '/bookings?includeExpired=true' : '/bookings',
  );
export const getBookingDetail = (reference: string) => api<BookingDetail>(path(reference));
export const cancelBooking = (reference: string) =>
  api<BookingDetail>(`${path(reference)}/cancel`, { method: 'POST' });
export const getReceipt = (reference: string) => api<Receipt>(`${path(reference)}/receipt`);
export const listTickets = (reference: string) => api<Ticket[]>(`${path(reference)}/tickets`);
export const getTicket = (number: string) => api<Ticket>(`/tickets/${encodeURIComponent(number)}`);
export const getETicket = (number: string) =>
  api<ETicket>(`/tickets/${encodeURIComponent(number)}/print`);
