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
const countryOf = new Map(WORLD_AIRPORTS.map(([code, , , country]) => [code, country]));

describe('NFR-PORT-01 a world network of real airports for the demo database', () => {
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
    for (const flight of flights) {
      expect(flight.flightNumber).toMatch(/^[A-Z0-9]{2}\d{1,4}$/);
      expect(flight.flightNumber.startsWith(flight.airlineCode)).toBe(true);
      expect(airlines.has(flight.airlineCode), flight.airlineCode).toBe(true);
      expect(zoneOf.has(flight.originCode)).toBe(true);
      expect(zoneOf.has(flight.destinationCode)).toBe(true);
      expect(flight.originCode).not.toBe(flight.destinationCode);
      expect(flight.scheduledDepartureUtc.getTime()).toBeGreaterThan(NOW.getTime());
      expect(flight.scheduledArrivalUtc.getTime()).toBeGreaterThan(
        flight.scheduledDepartureUtc.getTime(),
      );
      for (const fare of Object.values(flight.fares)) {
        expect(Number.isInteger(fare.amountMinor)).toBe(true);
        expect(fare.amountMinor).toBeGreaterThan(0);
        // One currency everywhere, so any outbound and return can share a round-trip booking.
        expect(fare.currency).toBe('EGP');
      }
      expect(flight.seats.ECONOMY).toBeGreaterThan(0);
      expect(flight.seats.BUSINESS).toBeGreaterThan(0);
    }
  });

  it('NFR-PORT-01-T14 no flight number is used twice on one local day at its origin', () => {
    // The Catalog rejects that as DUPLICATE_FLIGHT, which the seed would count as already there.
    const seen = new Set<string>();
    for (const flight of flights) {
      const key = `${flight.flightNumber}|${localDateOf(flight.scheduledDepartureUtc, zoneOf.get(flight.originCode)!)}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
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
    for (const flight of overlap) expect(later.has(key(flight)), key(flight)).toBe(true);
  });

  it('NFR-PORT-01-T16 every flight to a smaller airport has a flight back after it lands, for round trips', () => {
    const departuresBy = new Map<string, Date[]>();
    for (const flight of flights) {
      const route = `${flight.originCode}-${flight.destinationCode}`;
      departuresBy.set(route, [...(departuresBy.get(route) ?? []), flight.scheduledDepartureUtc]);
    }
    const hubs = new Set(Object.keys(HUBS));
    for (const flight of flights.filter((candidate) => !hubs.has(candidate.destinationCode))) {
      const back = departuresBy.get(`${flight.destinationCode}-${flight.originCode}`) ?? [];
      const arrival = flight.scheduledArrivalUtc.getTime();
      expect(
        back.some((departure) => departure.getTime() > arrival),
        `${flight.flightNumber} ${flight.scheduledDepartureUtc.toISOString()}`,
      ).toBe(true);
    }
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
});
