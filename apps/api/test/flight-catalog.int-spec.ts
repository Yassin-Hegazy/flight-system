import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_API, type CatalogApi, type NewFlight } from '../src/modules/flight-catalog/index';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

describe('Flight Catalog against PostgreSQL', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let catalog: CatalogApi;
  let dataSource: DataSource;

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    catalog = app.get<CatalogApi>(CATALOG_API);
    dataSource = app.get(DataSource);
    await dataSource.transaction(async (tx) => {
      await catalog.upsertAirport(tx, {
        code: 'CAI',
        name: 'Cairo International',
        city: 'Cairo',
        country: 'Egypt',
        timezone: 'Africa/Cairo',
      });
      await catalog.upsertAirport(tx, {
        code: 'LHR',
        name: 'Heathrow',
        city: 'London',
        country: 'United Kingdom',
        timezone: 'Europe/London',
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  const schedule = (input: NewFlight) =>
    dataSource.transaction((tx) => catalog.createFlight(tx, input));

  const ms777 = (departure: string, arrival: string): NewFlight => ({
    flightNumber: 'MS777',
    airlineCode: 'MS',
    originCode: 'CAI',
    destinationCode: 'LHR',
    scheduledDepartureUtc: new Date(departure),
    scheduledArrivalUtc: new Date(arrival),
  });

  describe('US-AD-01 a flight number repeats daily but not twice on one day', () => {
    it('US-AD-01-T10 MS777 can be scheduled on 10 and 11 December', async () => {
      const first = await schedule(ms777('2027-12-10T07:00:00Z', '2027-12-10T12:00:00Z'));
      const second = await schedule(ms777('2027-12-11T07:00:00Z', '2027-12-11T12:00:00Z'));
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
    });

    it('US-AD-01-T11 a second MS777 on the same local date at the origin is a duplicate', async () => {
      await schedule(ms777('2027-12-20T07:00:00Z', '2027-12-20T12:00:00Z'));
      // 20:00 UTC is 22:00 in Cairo: still 20 December at the origin.
      const sameDay = await schedule(ms777('2027-12-20T20:00:00Z', '2027-12-21T01:00:00Z'));
      expect(sameDay).toEqual({ ok: false, error: 'DUPLICATE_FLIGHT' });
    });
  });
});
