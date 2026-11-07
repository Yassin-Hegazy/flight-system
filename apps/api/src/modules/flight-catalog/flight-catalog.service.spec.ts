import { describe, expect, it, vi } from 'vitest';
import type { Tx } from '../../shared/db';
import type { Clock } from '../../shared/time';
import { Flight, type NewFlight } from './flight';
import { FlightCatalogService } from './flight-catalog.service';
import { InMemoryCatalogRepository } from './in-memory-catalog.repository';
import { AirportCode, Route } from './value-objects';

const TX = {} as Tx;
const NOW = new Date('2026-11-01T00:00:00Z');
const clock: Clock = { now: () => NOW };

function catalogWithReferenceData() {
  const repository = new InMemoryCatalogRepository()
    .addAirline({ code: 'MS', name: 'EgyptAir' })
    .addAirport({
      code: 'CAI',
      name: 'Cairo International',
      city: 'Cairo',
      country: 'Egypt',
      timezone: 'Africa/Cairo',
    })
    .addAirport({
      code: 'LHR',
      name: 'Heathrow',
      city: 'London',
      country: 'United Kingdom',
      timezone: 'Europe/London',
    });
  return { repository, service: new FlightCatalogService(repository, clock) };
}

const cairoToLondon = (overrides: Partial<NewFlight> = {}): NewFlight => ({
  flightNumber: 'MS777',
  airlineCode: 'MS',
  originCode: 'CAI',
  destinationCode: 'LHR',
  scheduledDepartureUtc: new Date('2026-12-10T07:00:00Z'),
  scheduledArrivalUtc: new Date('2026-12-10T12:00:00Z'),
  ...overrides,
});

function scheduled(input: NewFlight): Flight {
  const result = Flight.schedule(input, NOW);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('US-FL-01 View flight details (Catalog service)', () => {
  it('US-FL-01-T03 an unknown flight ID is not found, never fabricated data', async () => {
    const { service } = catalogWithReferenceData();
    expect(await service.getFlight('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('US-FL-01-T04 returns only the requested flight, with only its own fares', async () => {
    const { repository, service } = catalogWithReferenceData();
    const first = repository.addFlight(scheduled(cairoToLondon()));
    const second = repository.addFlight(scheduled(cairoToLondon({ flightNumber: 'MS779' })));
    await repository.saveFare(TX, {
      flightId: first,
      cabin: 'ECONOMY',
      fare: { amount: 100, currency: 'EGP' },
    });
    await repository.saveFare(TX, {
      flightId: second,
      cabin: 'ECONOMY',
      fare: { amount: 999, currency: 'EGP' },
    });

    const info = await service.getFlight(first);

    expect(info?.id).toBe(first);
    expect(info?.flightNumber).toBe('MS777');
    expect(info?.fares.ECONOMY?.amount).toBe(100);
  });
});

describe('US-AD-01 flight schedule rules (Catalog)', () => {
  it('US-AD-01-T03 rejects a flight whose origin equals its destination', async () => {
    const { service } = catalogWithReferenceData();
    const result = await service.createFlight(TX, cairoToLondon({ destinationCode: 'CAI' }));
    expect(result).toEqual({ ok: false, error: 'SAME_AIRPORT' });
  });
});

describe('NFR-PERF-01 search loads reference data in a fixed number of queries', () => {
  it('NFR-PERF-01-T01 50 results need one query each for airports, airlines and fares', async () => {
    const { repository, service } = catalogWithReferenceData();
    for (let i = 0; i < 50; i += 1) {
      repository.addFlight(
        scheduled(
          cairoToLondon({
            flightNumber: `MS${100 + i}`,
            scheduledDepartureUtc: new Date(Date.UTC(2026, 11, 10, 0, i)),
            scheduledArrivalUtc: new Date(Date.UTC(2026, 11, 10, 5, i)),
          }),
        ),
      );
    }
    const findAirports = vi.spyOn(repository, 'findAirports');
    const findFares = vi.spyOn(repository, 'findFares');
    const findAirlines = vi.spyOn(repository, 'findAirlines');
    const route = Route.between(AirportCode.of('CAI'), AirportCode.of('LHR'));
    if (!route.ok) throw new Error(route.error);

    const results = await service.findFlights(route.value, '2026-12-10');

    expect(results).toHaveLength(50);
    expect(findAirports).toHaveBeenCalledTimes(1);
    expect(findAirlines).toHaveBeenCalledTimes(1);
    expect(findFares).toHaveBeenCalledTimes(1);
  });
});
