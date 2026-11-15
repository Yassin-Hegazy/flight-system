import { api } from './api';
import { getFlight } from './flights-api';
import type { Money, ResultPage, SearchResult } from './search-api';

export type Cabin = 'ECONOMY' | 'BUSINESS';
export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

export interface Party {
  adults: number;
  children: number;
  infants: number;
}

export interface PassengerInput {
  firstName: string;
  lastName: string;
  birthDate: string;
  type: PassengerType;
}

export interface BookingInput {
  flightId: string;
  returnFlightId?: string;
  cabin: Cabin;
  /** The total the traveler saw, in minor units; the API refuses to book at another price. */
  displayedTotal: number;
  passengers: PassengerInput[];
}

export interface Booking {
  reference: string;
  cabin: Cabin;
  status: string;
  amount: Money;
  /** When the seat hold runs out, as an instant; null once paid or closed. */
  expiresAt: string | null;
  cancelReason: string | null;
  passengers: (PassengerInput & { fare: Money })[];
  segments: { flightId: string; cabin: Cabin }[];
}

export interface Payment {
  id: string;
  status: string;
  amount: Money;
  card?: { brand: string; last4: string };
}

export interface SavedTraveler {
  id: string;
  /** First name, a space, then the last name. */
  name: string;
  dateOfBirth: string;
}

/** One Idempotency-Key per attempt: the caller keeps it for a retry of the same request. */
export const createBooking = (input: BookingInput, idempotencyKey: string) =>
  api<Booking>('/bookings', {
    method: 'POST',
    body: input,
    headers: { 'idempotency-key': idempotencyKey },
  });

export const getBooking = (reference: string) =>
  api<Booking>(`/bookings/${encodeURIComponent(reference)}`);

export const payBooking = (reference: string, token: string, idempotencyKey: string) =>
  api<Payment>(`/bookings/${encodeURIComponent(reference)}/payments`, {
    method: 'POST',
    body: { token },
    headers: { 'idempotency-key': idempotencyKey },
  });

export const listSavedTravelers = () => api<SavedTraveler[]>('/users/me/saved-travelers');

/**
 * The price of one flight for a party, as the search prices it: the web app never works a fare
 * out itself. The flight is read first because the search is by route and day.
 */
export async function quoteFlight(flightId: string, party: Party, cabin: Cabin) {
  const flight = await getFlight(flightId);
  const params = new URLSearchParams({
    origin: flight.origin.code,
    destination: flight.destination.code,
    date: flight.scheduledDepartureLocal.slice(0, 10),
    adults: String(party.adults),
    children: String(party.children),
    infants: String(party.infants),
    cabin,
  });
  for (let page = 1; page <= 5; page += 1) {
    params.set('page', String(page));
    const results = await api<ResultPage>(`/search/flights?${params.toString()}`);
    const match = results.items.find((item) => item.flightId === flightId);
    if (match) return match;
    if (!results.hasNext) break;
  }
  throw new Error('This flight is no longer on sale for this party and cabin.');
}

export type Quote = SearchResult;
