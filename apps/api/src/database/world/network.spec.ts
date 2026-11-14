import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localDateOf } from '../../shared/time';
import { AIRLINES as REFERENCE_AIRLINES } from '../migrations/1794029666726-SeedCatalogReferenceData';
import { WORLD_AIRLINES } from '../migrations/1795046400000-SeedWorldAirlines';
import { WORLD_AIRPORTS } from './airports';
import { HUBS, WORLD_DAYS, buildWorldFlights, type WorldFlight } from './network';

// A fixed "now": the schedule is built relative to it, so these tests never depend on the date.
const NOW = new Date('2026-11-14T09:30:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const zoneOf = new Map(WORLD_AIRPORTS.map(([code, , , , timezone]) => [code, timezone]));
const formatters = new Map<string, Intl.DateTimeFormat>();
/** localDateOf with one formatter per zone: 50,000 localDateOf calls are slow. */
function localDate(instant: Date, timeZone: string): string {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }));
  }
  return formatters.get(timeZone)!.format(instant);
}
const countryOf = new Map(WORLD_AIRPORTS.map(([code, , , country]) => [code, country]));

// Generous timeouts: each build makes about 50,000 flights, and coverage slows that down.
describe(
  'NFR-PORT-01 a world network of real airports for the demo database',
  { timeout: 30_000 },
  () => {
    const flights = buildWorldFlights(NOW);

    it('NFR-PORT-01-T11 every airport is valid for the Catalog: a 3-letter code, a real zone, details that fit', () => {
      const codes = new Set<string>();
      for (const [code, name, city, country, timezone] of WORLD_AIRPORTS) {
        expect(code).toMatch(/^[A-Z]{3}$/);
        expect(codes.has(code)).toBe(false);
        codes.add(code);
        expect(isValidTimeZone(timezone)).toBe(true);
        for (const text of [name, city, country]) {
          expect(text.trim().length).toBeGreaterThan(0);
          expect(text.length).toBeLessThanOrEqual(120);
        }
      }
    });

    it('NFR-PORT-01-T12 every airport, and so every country, has at least 10 flights out and 10 in', () => {
      const departures = new Map<string, number>();
      const arrivals = new Map<string, number>();
      for (const flight of flights) {
        departures.set(flight.originCode, (departures.get(flight.originCode) ?? 0) + 1);
        arrivals.set(flight.destinationCode, (arrivals.get(flight.destinationCode) ?? 0) + 1);
      }
      for (const [code] of WORLD_AIRPORTS) {
        expect(departures.get(code) ?? 0, code).toBeGreaterThanOrEqual(10);
        expect(arrivals.get(code) ?? 0, code).toBeGreaterThanOrEqual(10);
      }
      const countries = new Set(flights.map((flight) => countryOf.get(flight.originCode)));
      expect(countries.size).toBe(new Set(countryOf.values()).size);
    });

    it('NFR-PORT-01-T13 every flight follows the Catalog rules the seed relies on', () => {
      const airlines = new Set([...REFERENCE_AIRLINES, ...WORLD_AIRLINES].map(([code]) => code));
      const who = (flight: WorldFlight) => [
        !/^[A-Z0-9]{2}\d{1,4}$/.test(flight.flightNumber) && 'number format',
        !flight.flightNumber.startsWith(flight.airlineCode) && 'number not of its airline',
        !airlines.has(flight.airlineCode) && 'unknown airline',
        !(zoneOf.has(flight.originCode) && zoneOf.has(flight.destinationCode)) && 'unknown airport',
        flight.originCode === flight.destinationCode && 'same origin and destination',
      ];
      const broken = (flight: WorldFlight): string[] =>
        [
          ...who(flight),
          flight.scheduledDepartureUtc <= NOW && 'departs in the past',
          flight.scheduledArrivalUtc <= flight.scheduledDepartureUtc && 'arrives before departing',
          // One currency everywhere, so any outbound and return can share a round-trip booking.
          Object.values(flight.fares).some(
            (fare) =>
              !Number.isInteger(fare.amountMinor) ||
              fare.amountMinor <= 0 ||
              fare.currency !== 'EGP',
          ) && 'fare',
          !(flight.seats.ECONOMY > 0 && flight.seats.BUSINESS > 0) && 'seats',
        ].filter((problem): problem is string => typeof problem === 'string');

      // Checked flight by flight, reported once: 50,000 expect calls would be slow.
      const problems = flights.flatMap((flight) =>
        broken(flight).map((problem) => `${flight.flightNumber}: ${problem}`),
      );
      expect(problems).toEqual([]);
    });

    it('NFR-PORT-01-T14 no flight number is used twice on one local day at its origin', () => {
      // The Catalog rejects that as DUPLICATE_FLIGHT, which the seed would count as already there.
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const flight of flights) {
        const key = `${flight.flightNumber}|${localDate(flight.scheduledDepartureUtc, zoneOf.get(flight.originCode)!)}`;
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
      }
      expect(duplicates).toEqual([]);
      for (const flight of flights.slice(0, 200)) {
        const zone = zoneOf.get(flight.originCode)!;
        expect(localDate(flight.scheduledDepartureUtc, zone)).toBe(
          localDateOf(flight.scheduledDepartureUtc, zone),
        );
      }
    });

    it('NFR-PORT-01-T15 the same moment gives the same schedule, and a later run agrees on the days both cover', () => {
      expect(buildWorldFlights(NOW)).toEqual(flights);

      const tomorrow = new Date(NOW.getTime() + DAY_MS);
      const key = (flight: WorldFlight) =>
        `${flight.flightNumber}|${flight.scheduledDepartureUtc.toISOString()}`;
      const later = new Set(buildWorldFlights(tomorrow).map(key));
      // Days both runs schedule in full, with margin for zones far from UTC and long return legs.
      const today = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());
      const from = today + 3 * DAY_MS;
      const until = today + WORLD_DAYS * DAY_MS;
      const overlap = flights.filter((flight) => {
        const departure = flight.scheduledDepartureUtc.getTime();
        return departure >= from && departure < until;
      });
      expect(overlap.length).toBeGreaterThan(0);
      expect(overlap.map(key).filter((flightKey) => !later.has(flightKey))).toEqual([]);
    });

    it('NFR-PORT-01-T16 every flight to a smaller airport has a flight back after it lands, for round trips', () => {
      const departuresBy = new Map<string, Date[]>();
      for (const flight of flights) {
        const route = `${flight.originCode}-${flight.destinationCode}`;
        departuresBy.set(route, [...(departuresBy.get(route) ?? []), flight.scheduledDepartureUtc]);
      }
      const hubs = new Set(Object.keys(HUBS));
      const stranded = flights
        .filter((flight) => !hubs.has(flight.destinationCode))
        .filter((flight) => {
          const back = departuresBy.get(`${flight.destinationCode}-${flight.originCode}`) ?? [];
          return !back.some((departure) => departure > flight.scheduledArrivalUtc);
        })
        .map((flight) => `${flight.flightNumber} ${flight.scheduledDepartureUtc.toISOString()}`);
      expect(stranded).toEqual([]);
    });

    it('NFR-PORT-01-T17 hubs connect to each other every day of the window', () => {
      const daily = flights.filter(
        (flight) => flight.originCode === 'CAI' && flight.destinationCode === 'DXB',
      );
      const days = new Set(
        daily.map((flight) => localDateOf(flight.scheduledDepartureUtc, 'Africa/Cairo')),
      );
      expect(days.size).toBeGreaterThanOrEqual(WORLD_DAYS - 1);
    });
  },
);
