import type { Cabin, NewFlight } from '../../modules/flight-catalog/index';
import { money } from '../../shared/money';
import { localDepartureInstant } from '../../shared/time';
import { WORLD_AIRPORTS, type WorldAirport } from './airports';

/**
 * A synthetic schedule over real airports: a hub-and-spoke network like the real one.
 *
 * - Hubs fly to every other hub within TRUNK_MAX_KM every day.
 * - Every other airport is linked to its SPOKE_HUBS nearest hubs, three days a week: the hub's
 *   airline flies out and turns straight back, so every outbound flight has a return after it.
 *
 * Pure and deterministic: a flight's existence, time and number depend only on its calendar date,
 * never on the moment the seed runs, so a later run meets the earlier run's flights as duplicates.
 */

/** How many days ahead the world schedule reaches, starting tomorrow. */
export const WORLD_DAYS = 14;

/** The hub airports and the airline based at each. */
export const HUBS: Record<string, string> = {
  CAI: 'MS',
  DXB: 'EK',
  DOH: 'QR',
  IST: 'TK',
  AUH: 'EY',
  RUH: 'SV',
  LHR: 'BA',
  CDG: 'AF',
  FRA: 'LH',
  AMS: 'KL',
  MAD: 'IB',
  FCO: 'AZ',
  ATL: 'DL',
  DFW: 'AA',
  ORD: 'UA',
  JFK: 'B6',
  LAX: 'AS',
  YYZ: 'AC',
  MEX: 'AM',
  BOG: 'AV',
  GRU: 'LA',
  EZE: 'AR',
  ADD: 'ET',
  NBO: 'KQ',
  JNB: 'SA',
  CMN: 'AT',
  LOS: 'P4',
  DEL: 'AI',
  SIN: 'SQ',
  HKG: 'CX',
  PVG: 'MU',
  PEK: 'CA',
  HND: 'JL',
  ICN: 'KE',
  BKK: 'TG',
  KUL: 'MH',
  CGK: 'GA',
  MNL: 'PR',
  SYD: 'QF',
  AKL: 'NZ',
};

const TRUNK_MAX_KM = 9_000;
const SPOKE_HUBS = 3;
/** Closer than this, a hub is a drive away, not a flight. */
const SPOKE_MIN_KM = 150;
/** Spoke flights run on these days of a seven-day cycle, never two days running. */
const SPOKE_DAYS = new Set([0, 2, 4]);
const TURNAROUND_MINUTES = 75;
/** World flight numbers start here, clear of the hand-written demo numbers below it. */
const FIRST_NUMBER = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
const CURRENCY = 'EGP';

interface Place {
  code: string;
  timezone: string;
  latitude: number;
  longitude: number;
}

/** One numbered service, flown on the days `flies` allows. */
interface Service {
  number: string;
  airline: string;
  origin: Place;
  destination: Place;
  distanceKm: number;
  /** Local departure time at the origin, HH:MM. */
  departs: string;
  daily: boolean;
  /** The service flown back as soon as this one lands, for spoke rotations. */
  back?: Service;
}

/** A flight to create, with the seats to give each cabin. */
export interface WorldFlight extends NewFlight {
  seats: Record<Cabin, number>;
}

/** The world schedule: every service on each of the next `days` days, from tomorrow. */
export function buildWorldFlights(
  now: Date,
  days = WORLD_DAYS,
  airports: readonly WorldAirport[] = WORLD_AIRPORTS,
): WorldFlight[] {
  const services = buildServices(airports.map(toPlace));
  const departureAt = departureClock();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const flights: WorldFlight[] = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const day = todayUtc + offset * DAY_MS;
    for (const service of services) flights.push(...flightsOn(service, day, departureAt));
  }
  return flights.filter((flight) => flight.scheduledDepartureUtc.getTime() > now.getTime());
}

function toPlace([code, , , , timezone, latitude, longitude]: WorldAirport): Place {
  return { code, timezone, latitude, longitude };
}

/** Trunk routes between hubs, then spoke rotations, numbered per airline in a stable order. */
function buildServices(places: readonly Place[]): Service[] {
  const hubs = places.filter((place) => HUBS[place.code]);
  const services: Service[] = [];
  for (const origin of hubs) {
    for (const destination of hubs) {
      const distanceKm = kilometres(origin, destination);
      if (origin === destination || distanceKm > TRUNK_MAX_KM) continue;
      services.push(service(origin, destination, distanceKm, true));
    }
  }
  for (const spoke of places.filter((place) => !HUBS[place.code])) {
    for (const hub of nearestHubs(spoke, hubs)) services.push(rotation(hub, spoke));
  }
  return numbered(services);
}

function nearestHubs(spoke: Place, hubs: readonly Place[]): Place[] {
  return hubs
    .map((hub) => ({ hub, distanceKm: kilometres(spoke, hub) }))
    .filter(({ distanceKm }) => distanceKm >= SPOKE_MIN_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.hub.code.localeCompare(b.hub.code))
    .slice(0, SPOKE_HUBS)
    .map(({ hub }) => hub);
}

/** Out from the hub in the morning or early afternoon, and straight back. */
function rotation(hub: Place, spoke: Place): Service {
  const distanceKm = kilometres(hub, spoke);
  const out = service(hub, spoke, distanceKm, false);
  out.departs = timeOfDay(`${hub.code}${spoke.code}`, 6, 15);
  out.back = { ...service(spoke, hub, distanceKm, false), airline: out.airline };
  return out;
}

function service(origin: Place, destination: Place, distanceKm: number, daily: boolean): Service {
  return {
    number: '',
    airline: HUBS[origin.code] ?? '',
    origin,
    destination,
    distanceKm,
    departs: timeOfDay(`${origin.code}${destination.code}`, 6, 22),
    daily,
  };
}

/** Each airline numbers its services from FIRST_NUMBER; a rotation takes an even-odd pair. */
function numbered(services: Service[]): Service[] {
  const next = new Map<string, number>();
  const sorted = [...services].sort((a, b) => routeKey(a).localeCompare(routeKey(b)));
  for (const item of sorted) {
    const airline = item.airline;
    let number = next.get(airline) ?? FIRST_NUMBER;
    if (item.back && number % 2 === 1) number += 1;
    item.number = `${airline}${number}`;
    if (item.back) item.back.number = `${airline}${number + 1}`;
    next.set(airline, number + (item.back ? 2 : 1));
  }
  return sorted;
}

/** The flights a service makes on one calendar day: none, one, or a rotation's two. */
function flightsOn(item: Service, dayUtc: number, departureAt: DepartureClock): WorldFlight[] {
  if (!item.daily && !SPOKE_DAYS.has((dayUtc / DAY_MS + hash(routeKey(item))) % 7)) return [];
  const departure = departureAt(dayUtc, item.departs, item.origin.timezone);
  if (!departure) return [];
  const out = flight(item, departure);
  if (!item.back) return [out];
  const turnaround = out.scheduledArrivalUtc.getTime() + TURNAROUND_MINUTES * MINUTE_MS;
  return [out, flight(item.back, new Date(turnaround))];
}

type DepartureClock = (dayUtc: number, time: string, timeZone: string) => Date | null;

/**
 * Local wall-clock departures, resolving each zone's UTC offset once per day: Intl is slow, and
 * 50,000 flights would otherwise take most of a minute. The offset is read at noon; every
 * departure is between 06:00 and 23:00, after the night-time clock changes zones make.
 */
function departureClock(): DepartureClock {
  const offsets = new Map<string, number | null>();
  return (dayUtc, time, timeZone) => {
    const key = `${timeZone}|${dayUtc}`;
    if (!offsets.has(key)) {
      const date = new Date(dayUtc).toISOString().slice(0, 10);
      const noon = localDepartureInstant(date, '12:00', timeZone);
      offsets.set(key, noon ? dayUtc + 12 * 60 * MINUTE_MS - noon.getTime() : null);
    }
    const offset = offsets.get(key);
    if (offset == null) return null;
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(dayUtc + (hours * 60 + minutes) * MINUTE_MS - offset);
  };
}

function flight(item: Service, departure: Date): WorldFlight {
  const economy = economyFare(item);
  return {
    flightNumber: item.number,
    airlineCode: item.airline,
    originCode: item.origin.code,
    destinationCode: item.destination.code,
    scheduledDepartureUtc: departure,
    scheduledArrivalUtc: new Date(departure.getTime() + durationMinutes(item) * MINUTE_MS),
    fares: {
      ECONOMY: money(economy * 100, CURRENCY),
      BUSINESS: money(roundTo(economy * 4, 50) * 100, CURRENCY),
    },
    seats:
      item.distanceKm < 3_000 ? { ECONOMY: 150, BUSINESS: 12 } : { ECONOMY: 260, BUSINESS: 30 },
  };
}

/** Cruise at about 800 km/h, plus half an hour of taxi, climb and approach. */
function durationMinutes(item: Service): number {
  return roundTo(30 + (item.distanceKm / 800) * 60, 5);
}

/** In whole pounds: a base plus a rate per kilometre, give or take 10% per route. */
function economyFare(item: Service): number {
  const spread = 0.9 + (hash(routeKey(item)) % 21) / 100;
  return roundTo((2_000 + 3.6 * item.distanceKm) * spread, 50);
}

/** A departure time between `fromHour` and `toHour` local, on a five-minute grid. */
function timeOfDay(key: string, fromHour: number, toHour: number): string {
  const minutes = fromHour * 60 + (hash(key) % ((toHour - fromHour) * 12)) * 5;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function routeKey(item: Service): string {
  return `${item.origin.code}${item.destination.code}`;
}

/** Great-circle distance. */
function kilometres(a: Place, b: Place): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const [lat1, lat2] = [radians(a.latitude), radians(b.latitude)];
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * 6_371 * Math.asin(Math.sqrt(h));
}

/** FNV-1a: a stable spread for times, days and fares, the same on every run. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
