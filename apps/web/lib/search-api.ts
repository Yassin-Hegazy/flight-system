// The search API as the browser sees it: JSON over /api/* (rewritten to the NestJS API).
// These types mirror the API's ResultPage; the web app never imports API code.

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface PriceLine {
  passengerType: 'ADULT' | 'CHILD' | 'INFANT';
  count: number;
  unitPrice: Money;
  amount: Money;
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  timezone: string;
}

export interface SearchResult {
  flightId: string;
  flightNumber: string;
  airline: { code: string; name: string };
  origin: Airport;
  destination: Airport;
  departureLocal: string;
  arrivalLocal: string;
  departureUtc: string;
  arrivalUtc: string;
  estimatedDepartureLocal?: string;
  status: string;
  durationMinutes: number;
  stops: number;
  cabin: 'ECONOMY' | 'BUSINESS';
  adultFare: Money;
  total: Money;
  breakdown: PriceLine[];
}

export interface Filters {
  maxTotal?: number;
  departureWindow?: { from: string; to: string };
  airlines?: string[];
}

export interface ResultPage {
  items: SearchResult[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  sort: string;
  filters: Filters;
}

export type SearchOutcome =
  | { kind: 'one-way'; page: ResultPage }
  | { kind: 'round-trip'; outbound: ResultPage; inbound: ResultPage };

export interface AirportSuggestion {
  code: string;
  name: string;
  city: string;
  country: string;
}

/** The API's shared error shape (NFR-ERR-01). */
export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

/** A 4xx the traveler can fix: carries the API's code, message and per-field errors. */
export class SearchRequestError extends Error {
  constructor(readonly body: ApiErrorBody) {
    super(body.message);
    this.name = 'SearchRequestError';
  }
}

export const SORT_OPTIONS = [
  { value: 'PRICE', label: 'Lowest price' },
  { value: 'DURATION', label: 'Shortest duration' },
  { value: 'DEPARTURE_TIME', label: 'Earliest departure' },
  { value: 'ARRIVAL_TIME', label: 'Earliest arrival' },
] as const;

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body as T;
  if (response.status < 500 && isErrorBody(body)) throw new SearchRequestError(body);
  throw new Error(`Search failed with status ${response.status}`);
}

/**
 * Runs the search the URL describes, unchanged: a returnDate makes it a round trip. The URL
 * parameters are the API's query parameters, so the page is shareable and the back button works.
 */
export async function runSearch(params: URLSearchParams): Promise<SearchOutcome> {
  if (params.get('returnDate')) {
    const both = await getJson<{ outbound: ResultPage; inbound: ResultPage }>(
      `/api/search/round-trip?${params.toString()}`,
    );
    return { kind: 'round-trip', ...both };
  }
  const page = await getJson<ResultPage>(`/api/search/flights?${params.toString()}`);
  return { kind: 'one-way', page };
}

export function suggestAirports(query: string): Promise<AirportSuggestion[]> {
  return getJson<AirportSuggestion[]>(
    `/api/flights/airports/suggestions?q=${encodeURIComponent(query)}`,
  );
}
