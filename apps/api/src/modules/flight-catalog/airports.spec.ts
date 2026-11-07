import { describe, expect, it } from 'vitest';
import type { Tx } from '../../shared/db';
import type { AirportInput } from './catalog-api';
import { FlightCatalogService } from './flight-catalog.service';
import { InMemoryCatalogRepository } from './in-memory-catalog.repository';

const TX = {} as Tx;

const cairo = (overrides: Partial<AirportInput> = {}): AirportInput => ({
  code: 'cai',
  name: 'Cairo International',
  city: 'Cairo',
  country: 'Egypt',
  timezone: 'Africa/Cairo',
  ...overrides,
});

function catalog() {
  const repository = new InMemoryCatalogRepository();
  const service = new FlightCatalogService(repository, { now: () => new Date() });
  return { repository, service };
}

describe('Airport data the Catalog depends on (NFR-DATA-02)', () => {
  it('NFR-DATA-02-T07 saves an airport with a valid IANA time zone under its normalised code', async () => {
    const { repository, service } = catalog();
    expect(await service.upsertAirport(TX, cairo())).toEqual({ ok: true, value: 'CAI' });
    expect(await repository.findAirports(['CAI'])).toHaveLength(1);
  });

  it('NFR-DATA-02-T08 rejects an unknown time zone, so one bad entry cannot break flight pages', async () => {
    const { repository, service } = catalog();
    expect(await service.upsertAirport(TX, cairo({ timezone: 'Cairo/Egypt' }))).toEqual({
      ok: false,
      error: 'INVALID_TIMEZONE',
    });
    expect(await repository.findAirports(['CAI'])).toEqual([]);
  });

  it('NFR-SEC-03-T02 rejects blank names, cities and countries', async () => {
    const { service } = catalog();
    for (const blank of [{ name: ' ' }, { city: '' }, { country: '  ' }]) {
      expect(await service.upsertAirport(TX, cairo(blank))).toEqual({
        ok: false,
        error: 'INVALID_AIRPORT_DETAILS',
      });
    }
  });
});
