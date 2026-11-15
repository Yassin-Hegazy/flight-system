import { api } from './api';
import type { Airport, Money } from './search-api';

export type FlightStatus =
  'SCHEDULED' | 'DELAYED' | 'BOARDING' | 'DEPARTED' | 'ARRIVED' | 'CANCELLED';

/** One flight as GET /flights/:id sends it. Local times carry their own offset. */
export interface Flight {
  id: string;
  flightNumber: string;
  airline: { code: string; name: string };
  origin: Airport;
  destination: Airport;
  scheduledDepartureLocal: string;
  scheduledArrivalLocal: string;
  /** Present once the departure has moved (a delay). */
  estimatedDepartureLocal?: string;
  durationMinutes: number;
  status: FlightStatus;
  fares: Partial<Record<'ECONOMY' | 'BUSINESS', Money>>;
}

export const STATUS_LABEL: Record<FlightStatus, string> = {
  SCHEDULED: 'Scheduled',
  DELAYED: 'Delayed',
  BOARDING: 'Boarding',
  DEPARTED: 'Departed',
  ARRIVED: 'Arrived',
  CANCELLED: 'Cancelled',
};

export const getFlight = (id: string) => api<Flight>(`/flights/${encodeURIComponent(id)}`);
