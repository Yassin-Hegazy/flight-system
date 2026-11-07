import { describe, expect, it } from 'vitest';
import type { Tx } from '../../shared/db';
import { money } from '../../shared/money';
import { FlightCatalogService } from './flight-catalog.service';
import { InMemoryCatalogRepository } from './in-memory-catalog.repository';
import { AirportCode, Route } from './value-objects';

const TX = {} as Tx;
const NOW = new Date('2026-11-01T00:00:00Z');

async function catalogWithFlightsLeavingCairoAt(departuresUtc: string[]) {
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
  const service = new FlightCatalogService(repository, { now: () => NOW });
  for (const [index, departure] of departuresUtc.entries()) {
    const departureUtc = new Date(departure);
    const result = await service.createFlight(TX, {
      flightNumber: `MS${700 + index}`,
      airlineCode: 'MS',
      originCode: 'CAI',
      destinationCode: 'LHR',
      scheduledDepartureUtc: departureUtc,
      scheduledArrivalUtc: new Date(departureUtc.getTime() + 5 * 3_600_000),
      fares: { ECONOMY: money(10000, 'EGP'), BUSINESS: money(40000, 'EGP') },
    });
    if (!result.ok) throw new Error(result.error);
  }
  return service;
}

function cairoToLondon(): Route {
  const route = Route.between(AirportCode.of('CAI'), AirportCode.of('LHR'));
  if (!route.ok) throw new Error(route.error);
  return route.value;
}

describe('US-FL-01 / NFR-DATA-02 search covers one local day at the origin', () => {
  it('NFR-DATA-02-T09 a 00:30 Cairo departure belongs to that Cairo date, not the UTC date', async () => {
    // 22:30 UTC on 9 December is 00:30 on 10 December in Cairo (UTC+2).
    const service = await catalogWithFlightsLeavingCairoAt(['2026-12-09T22:30:00Z']);

    const tenth = await service.findFlights(cairoToLondon(), '2026-12-10');
    const ninth = await service.findFlights(cairoToLondon(), '2026-12-09');

    expect(tenth.map((flight) => flight.scheduledDepartureLocal)).toEqual([
      '2026-12-10T00:30+02:00',
    ]);
    expect(ninth).toEqual([]);
  });

  it('NFR-DATA-02-T10 the local day ends at local midnight, not UTC midnight', async () => {
    const service = await catalogWithFlightsLeavingCairoAt([
      '2026-12-10T21:30:00Z', // 23:30 on the 10th in Cairo: included
      '2026-12-10T22:30:00Z', // 00:30 on the 11th in Cairo: excluded
    ]);

    const tenth = await service.findFlights(cairoToLondon(), '2026-12-10');

    expect(tenth.map((flight) => flight.scheduledDepartureLocal)).toEqual([
      '2026-12-10T23:30+02:00',
    ]);
  });
});
