// Test helpers for Search's unit tests. Not exported from index.ts.
import { money } from '../../shared/money';
import { type AirportInfo, FlightStatus } from '../flight-catalog/index';
import type { SearchResult } from './search-api';

export const CAIRO: AirportInfo = {
  code: 'CAI',
  name: 'Cairo International',
  city: 'Cairo',
  timezone: 'Africa/Cairo',
};

export const HEATHROW: AirportInfo = {
  code: 'LHR',
  name: 'Heathrow',
  city: 'London',
  timezone: 'Europe/London',
};

export interface ResultSpec {
  flight?: string;
  total?: number;
  /** UTC instant, e.g. 2026-12-10T09:00Z. */
  departs?: string;
  durationMinutes?: number;
  /** Local departure as stored by the Catalog, e.g. 2026-12-10T11:00+02:00. */
  departureLocal?: string;
  airline?: string;
}

/** A SearchResult with only the fields a test cares about spelled out. */
export function result(spec: ResultSpec = {}): SearchResult {
  const flightNumber = spec.flight ?? 'MS777';
  const departureUtc = new Date(spec.departs ?? '2026-12-10T09:00Z');
  const durationMinutes = spec.durationMinutes ?? 300;
  const arrivalUtc = new Date(departureUtc.getTime() + durationMinutes * 60_000);
  const total = money(spec.total ?? 10000, 'EGP');
  const airlineCode = spec.airline ?? flightNumber.slice(0, 2);
  return {
    flightId: `id-${flightNumber}-${departureUtc.toISOString()}`,
    flightNumber,
    airline: { code: airlineCode, name: airlineCode },
    origin: CAIRO,
    destination: HEATHROW,
    departureLocal: spec.departureLocal ?? '2026-12-10T11:00+02:00',
    arrivalLocal: '2026-12-10T14:00+00:00',
    departureUtc,
    arrivalUtc,
    status: FlightStatus.Scheduled,
    durationMinutes,
    stops: 0,
    cabin: 'ECONOMY',
    adultFare: total,
    total,
    breakdown: [{ passengerType: 'ADULT', count: 1, unitPrice: total, amount: total }],
  };
}

/** A small deterministic pseudo-random generator, so property-style tests repeat exactly. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}
