import { describe, expect, it, vi } from 'vitest';
import type { Tx } from '../../shared/db';
import { money } from '../../shared/money';
import type { Clock } from '../../shared/time';
import { Flight, type NewFlight } from './flight';
import { FlightStatus } from './flight-status';
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
  fares: { ECONOMY: money(10000, 'EGP'), BUSINESS: money(40000, 'EGP') },
  ...overrides,
});

function scheduled(input: NewFlight): Flight {
  const result = Flight.schedule(input, {
    now: NOW,
    timeZoneOf: () => 'Africa/Cairo',
    airlineExists: () => true,
  });
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
      fare: money(10000, 'EGP'),
    });
    await repository.saveFare(TX, {
      flightId: second,
      cabin: 'ECONOMY',
      fare: money(99900, 'EGP'),
    });

    const info = await service.getFlight(first);

    expect(info?.id).toBe(first);
    expect(info?.flightNumber).toBe('MS777');
    expect(info?.fares.ECONOMY).toEqual(money(10000, 'EGP'));
  });
});

describe('US-FL-02 See current flight status (Catalog service)', () => {
  it('US-FL-02-T03 a delayed flight shows the new estimated time beside the original', async () => {
    const { repository, service } = catalogWithReferenceData();
    const flight = scheduled(cairoToLondon());
    const delay = flight.changeStatus(FlightStatus.Delayed, new Date('2026-12-10T09:30:00Z'));
    if (!delay.ok) throw new Error(delay.error);
    const id = repository.addFlight(flight);

    const info = await service.getFlight(id);

    expect(info?.status).toBe(FlightStatus.Delayed);
    expect(info?.scheduledDepartureLocal).toBe('2026-12-10T09:00+02:00');
    expect(info?.estimatedDepartureLocal).toBe('2026-12-10T11:30+02:00');
  });
});

describe('US-AD-01 flight schedule rules (Catalog)', () => {
  it('US-AD-01-T03 rejects a flight whose origin equals its destination', async () => {
    const { service } = catalogWithReferenceData();
    const result = await service.createFlight(TX, cairoToLondon({ destinationCode: 'CAI' }));
    expect(result).toEqual({ ok: false, error: 'SAME_AIRPORT' });
  });

  it('US-AD-01-T12 rejects a flight to or from an airport the Catalog does not know', async () => {
    const { service } = catalogWithReferenceData();
    const result = await service.createFlight(TX, cairoToLondon({ destinationCode: 'JFK' }));
    expect(result).toEqual({ ok: false, error: 'UNKNOWN_AIRPORT' });
  });

  it('US-AD-01-T13 records the departure date at the origin, not the UTC date', async () => {
    const { repository, service } = catalogWithReferenceData();
    // 22:30 UTC on 9 December is 00:30 on 10 December in Cairo.
    const result = await service.createFlight(
      TX,
      cairoToLondon({
        scheduledDepartureUtc: new Date('2026-12-09T22:30:00Z'),
        scheduledArrivalUtc: new Date('2026-12-10T03:30:00Z'),
      }),
    );
    if (!result.ok) throw new Error(result.error);
    expect((await repository.findFlight(result.value))?.departureLocalDate).toBe('2026-12-10');
  });
});

describe('US-AD-01 a new flight carries its airline and both cabin fares', () => {
  it('US-AD-01-T14 rejects an airline the Catalog does not know', async () => {
    const { service } = catalogWithReferenceData();
    const result = await service.createFlight(
      TX,
      cairoToLondon({ flightNumber: 'XX123', airlineCode: 'XX' }),
    );
    expect(result).toEqual({ ok: false, error: 'UNKNOWN_AIRLINE' });
  });

  it('US-AD-01-T15 stores the ECONOMY and BUSINESS fares with the new flight', async () => {
    const { service } = catalogWithReferenceData();
    const created = await service.createFlight(TX, cairoToLondon());
    if (!created.ok) throw new Error(created.error);
    expect((await service.getFlight(created.value))?.fares).toEqual({
      ECONOMY: money(10000, 'EGP'),
      BUSINESS: money(40000, 'EGP'),
    });
  });

  it('US-AD-01-T16 rejects a missing fare, and a fare that is not a positive whole amount', async () => {
    const { service } = catalogWithReferenceData();
    const economyOnly = { ECONOMY: money(10000, 'EGP') } as NewFlight['fares'];
    expect(await service.createFlight(TX, cairoToLondon({ fares: economyOnly }))).toEqual({
      ok: false,
      error: 'MISSING_FARE',
    });
    for (const amountMinor of [0, -100, 99.5]) {
      const fares = {
        ECONOMY: { amountMinor, currency: 'EGP' },
        BUSINESS: money(40000, 'EGP'),
      };
      expect(await service.createFlight(TX, cairoToLondon({ fares }))).toEqual({
        ok: false,
        error: 'FARE_NOT_POSITIVE',
      });
    }
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
