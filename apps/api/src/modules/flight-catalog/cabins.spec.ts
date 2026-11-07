import { describe, expect, it } from 'vitest';
import type { Tx } from '../../shared/db';
import { money } from '../../shared/money';
import { Flight } from './flight';
import { FlightCatalogService } from './flight-catalog.service';
import { InMemoryCatalogRepository } from './in-memory-catalog.repository';
import { CABINS, type Cabin, isCabin } from './value-objects';

const TX = {} as Tx;
const NOW = new Date('2026-11-01T00:00:00Z');

describe('Overview 4.3 two cabins per flight', () => {
  it('US-AD-01-T08 the system has exactly ECONOMY and BUSINESS', () => {
    expect([...CABINS]).toEqual(['ECONOMY', 'BUSINESS']);
    expect(isCabin('ECONOMY')).toBe(true);
    expect(isCabin('FIRST')).toBe(false);
    expect(isCabin('PREMIUM_ECONOMY')).toBe(false);
  });

  it('US-AD-01-T09 a fare for any other cabin is rejected, not stored', async () => {
    const repository = new InMemoryCatalogRepository();
    const scheduled = Flight.schedule(
      {
        flightNumber: 'MS777',
        airlineCode: 'MS',
        originCode: 'CAI',
        destinationCode: 'LHR',
        scheduledDepartureUtc: new Date('2026-12-10T07:00:00Z'),
        scheduledArrivalUtc: new Date('2026-12-10T12:00:00Z'),
        fares: { ECONOMY: money(10000, 'EGP'), BUSINESS: money(40000, 'EGP') },
      },
      { now: NOW, timeZoneOf: () => 'Africa/Cairo', airlineExists: () => true },
    );
    if (!scheduled.ok) throw new Error(scheduled.error);
    const flightId = repository.addFlight(scheduled.value);
    const service = new FlightCatalogService(repository, { now: () => NOW });

    const result = await service.setFare(TX, flightId, 'FIRST' as Cabin, money(90000, 'EGP'));

    expect(result).toEqual({ ok: false, error: 'INVALID_CABIN' });
    expect(await repository.findFares([flightId])).toEqual([]);
  });
});
