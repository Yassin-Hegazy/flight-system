import { describe, expect, it } from 'vitest';
import { localDateOf } from '../shared/time';
import { DEMO_DAYS, DEMO_ROUTES, buildDemoFlights } from './seed-demo';

// A fixed "now": the schedule is built relative to it, so these tests never depend on the date.
const NOW = new Date('2026-11-10T09:30:00Z');

describe('NFR-PORT-01 demo flights for a fresh database', () => {
  const flights = buildDemoFlights(NOW);

  it('NFR-PORT-01-T01 offers every route on each of the next days', () => {
    expect(flights).toHaveLength(DEMO_ROUTES.length * DEMO_DAYS);
  });

  it('NFR-PORT-01-T01 every flight departs in the future, so the Catalog accepts it', () => {
    for (const flight of flights) {
      expect(flight.scheduledDepartureUtc.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('NFR-PORT-01-T01 every flight arrives after it departs, with positive whole-number fares', () => {
    for (const flight of flights) {
      expect(flight.scheduledArrivalUtc.getTime()).toBeGreaterThan(
        flight.scheduledDepartureUtc.getTime(),
      );
      for (const fare of Object.values(flight.fares)) {
        expect(Number.isInteger(fare.amountMinor)).toBe(true);
        expect(fare.amountMinor).toBeGreaterThan(0);
      }
    }
  });

  it('NFR-PORT-01-T01 each flight number carries its own airline code (MS777 belongs to MS)', () => {
    for (const flight of flights) {
      expect(flight.flightNumber.startsWith(flight.airlineCode)).toBe(true);
      expect(flight.flightNumber).toMatch(/^[A-Z0-9]{2}\d{1,4}$/);
    }
  });

  it('NFR-PORT-01-T01 no flight number is used twice on one local day at its origin', () => {
    // The Catalog rejects that as DUPLICATE_FLIGHT, so the seed must never produce it.
    const seen = new Set<string>();
    for (const flight of flights) {
      const origin = DEMO_ROUTES.find((route) => route.number === flight.flightNumber)!.timeZone;
      const key = `${flight.flightNumber}|${localDateOf(flight.scheduledDepartureUtc, origin)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('NFR-PORT-01-T02 the same moment always gives the same schedule, so a re-run only meets duplicates', () => {
    expect(buildDemoFlights(NOW)).toEqual(flights);
  });

  it('NFR-PORT-01-T02 the schedule starts tomorrow and spans the configured number of days', () => {
    const departures = flights.map((flight) =>
      flight.scheduledDepartureUtc.toISOString().slice(0, 10),
    );
    expect(departures.sort()[0]).toBe('2026-11-11');
    expect(new Set(departures).size).toBe(DEMO_DAYS);
  });

  it('NFR-PORT-01-T01 the demo covers return legs, so a traveler can book both directions', () => {
    const pairs = new Set(DEMO_ROUTES.map((route) => `${route.origin}-${route.destination}`));
    expect(pairs.has('CAI-LHR')).toBe(true);
    expect(pairs.has('LHR-CAI')).toBe(true);
  });
});
