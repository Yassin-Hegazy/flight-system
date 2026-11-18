// The administration endpoints. Every call needs an administrator's session; the API answers
// 401 when nobody is signed in and 403 for a traveler, and it checks every rule again.
import { api } from './api';
import type { Flight, FlightStatus } from './flights-api';
import type { Money } from './search-api';

export type Cabin = 'ECONOMY' | 'BUSINESS';
export const CABINS: Cabin[] = ['ECONOMY', 'BUSINESS'];
export const CABIN_LABEL: Record<Cabin, string> = { ECONOMY: 'Economy', BUSINESS: 'Business' };

/** One page of a list, as GET /admin/flights and GET /admin/airports send it. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminFlight extends Flight {
  scheduledDepartureUtc: string;
  cancelReason?: string;
}

export interface FlightFilter {
  origin?: string;
  destination?: string;
  flightNumber?: string;
  status?: FlightStatus;
  departingFrom?: string;
  departingBefore?: string;
  page?: number;
}

export interface CabinLoad {
  cabin: Cabin;
  capacity: number;
  committedSeats: number;
  activeHeldSeats: number;
  availableSeats: number;
}

export interface ManifestEntry {
  passengerName: string;
  bookingReference: string;
  ticketNumber: string | null;
  status: string;
}

export interface AirportRecord {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  target: string;
  flightId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface NewFlight {
  flightNumber: string;
  airlineCode: string;
  originCode: string;
  destinationCode: string;
  scheduledDepartureUtc: string;
  scheduledArrivalUtc: string;
  currency: string;
  fares: Record<Cabin, number>;
  capacity: Record<Cabin, number>;
}

export interface NewAdministrator {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

/** The audit trail is read 20 entries at a time. */
export const AUDIT_PAGE_SIZE = 20;

/**
 * The moves the API allows from each status, so the form only offers those. Cancelling has its
 * own form because it needs a reason. The API's table is the authority; this is only the menu.
 */
export const NEXT_STATUSES: Record<FlightStatus, FlightStatus[]> = {
  SCHEDULED: ['DELAYED', 'BOARDING'],
  DELAYED: ['DELAYED', 'BOARDING'],
  BOARDING: ['DEPARTED'],
  DEPARTED: ['ARRIVED'],
  ARRIVED: [],
  CANCELLED: [],
};

/** Only these can still be cancelled. */
export const CANCELLABLE: FlightStatus[] = ['SCHEDULED', 'DELAYED', 'BOARDING'];

function query(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const flightPath = (id: string) => `/admin/flights/${encodeURIComponent(id)}`;

/** POST /users/admins: an account with the ADMIN role, created at once (US-USR-04 AC-3). */
export function createAdministrator(input: NewAdministrator): Promise<{ id: string }> {
  return api<{ id: string }>('/users/admins', { method: 'POST', body: input });
}

export const listFlights = (filter: FlightFilter) =>
  api<Page<AdminFlight>>(`/admin/flights${query(filter)}`);

export const createFlight = (input: NewFlight) =>
  api<{ id: string }>('/admin/flights', { method: 'POST', body: input });

export const getLoad = (id: string) => api<CabinLoad[]>(`${flightPath(id)}/load`);

export const getManifest = (id: string) => api<ManifestEntry[]>(`${flightPath(id)}/manifest`);

export const changeStatus = (id: string, status: FlightStatus, estimatedDepartureUtc?: string) =>
  api<{ status: FlightStatus; previousStatus: FlightStatus }>(`${flightPath(id)}/status`, {
    method: 'PATCH',
    body: estimatedDepartureUtc ? { status, estimatedDepartureUtc } : { status },
  });

export const cancelFlight = (id: string, reason: string) =>
  api(`${flightPath(id)}/cancel`, { method: 'POST', body: { reason } });

export const setCapacity = (id: string, cabin: Cabin, capacity: number) =>
  api(`${flightPath(id)}/capacity/${cabin}`, { method: 'PUT', body: { capacity } });

export const setFare = (id: string, cabin: Cabin, fare: Money) =>
  api<Money>(`${flightPath(id)}/fares/${cabin}`, { method: 'PUT', body: fare });

export const listAirports = (q: string, page: number) =>
  api<Page<AirportRecord>>(`/admin/airports${query({ q, page })}`);

export const saveAirport = ({ code, ...details }: AirportRecord) =>
  api(`/admin/airports/${encodeURIComponent(code)}`, { method: 'PUT', body: details });

export const deleteAirport = (code: string) =>
  api(`/admin/airports/${encodeURIComponent(code)}`, { method: 'DELETE' });

export const listAudit = (flightId: string | undefined, page: number) =>
  api<AuditEntry[]>(`/admin/audit${query({ flightId, page })}`);

/** A datetime-local value ("2027-01-10T06:00") read as UTC: "2027-01-10T06:00:00Z". */
export const utcInstant = (local: string) => (local ? `${local}:00Z` : '');

/** The UTC day a YYYY-MM-DD date names, as a departure window. */
export function utcDay(date: string): { departingFrom: string; departingBefore: string } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  return { departingFrom: start.toISOString(), departingBefore: end.toISOString() };
}

/** "UpdateFlightStatus" → "Update flight status". */
export function actionLabel(action: string): string {
  const words = action.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function show(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** What an audit entry changed, one line per field: "status: SCHEDULED → DELAYED". */
export function changeLines(entry: AuditEntry): string[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((key) => show(before[key]) !== show(after[key]))
    .map((key) => `${key}: ${show(before[key])} → ${show(after[key])}`);
}
