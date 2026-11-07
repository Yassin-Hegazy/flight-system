import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { money } from '../src/shared/money';
import {
  CATALOG_API,
  type CatalogApi,
  FlightStatus,
  type NewFlight,
} from '../src/modules/flight-catalog/index';
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
    // Airlines and airports (MS, CAI, LHR, ...) come from the reference-data seed migration.
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
    fares: { ECONOMY: money(1500000, 'EGP'), BUSINESS: money(6000000, 'EGP') },
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

  describe('NFR-SEC-03 malformed input is a 400, never a 500', () => {
    it('NFR-SEC-03-T03 a full timestamp as the search date is rejected per field', async () => {
      const response = await request(app.getHttpServer())
        .get('/flights')
        .query({ origin: 'CAI', destination: 'LHR', date: '2026-12-10T05:00:00Z' })
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.fieldErrors).toEqual({ date: expect.any(String) });
    });

    it('NFR-SEC-03-T04 a flight ID that is not a UUID is a 400', async () => {
      const response = await request(app.getHttpServer()).get('/flights/abc').expect(400);
      expect(response.body.requestId).toBe(response.headers['x-request-id']);
    });

    it('US-FL-01-T06 a well-formed but unknown flight ID is a 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/flights/00000000-0000-4000-8000-000000000000')
        .expect(404);
      expect(response.body.code).toBe('FLIGHT_NOT_FOUND');
    });

    it('NFR-SEC-03-T05 a search from an airport to itself is a 400, not an empty list', async () => {
      const response = await request(app.getHttpServer())
        .get('/flights')
        .query({ origin: 'CAI', destination: 'cai', date: '2026-12-10' })
        .expect(400);
      expect(response.body.code).toBe('SAME_AIRPORT');
    });

    it('US-FL-03-T06 LIKE wildcards in an airport query are plain characters', async () => {
      for (const q of ['%%', '__', '%a']) {
        const response = await request(app.getHttpServer())
          .get('/flights/airports/suggestions')
          .query({ q })
          .expect(200);
        expect(response.body).toEqual([]);
      }
    });

    it('NFR-SEC-03-T06 an injection string as an airport query is treated as text', async () => {
      const response = await request(app.getHttpServer())
        .get('/flights/airports/suggestions')
        .query({ q: "' OR 1=1 --" })
        .expect(200);
      expect(response.body).toEqual([]);
    });
  });
  const http = () => request(app.getHttpServer());

  async function scheduledFlight(flightNumber: string, departure: string, arrival: string) {
    const created = await schedule({ ...ms777(departure, arrival), flightNumber });
    if (!created.ok) throw new Error(created.error);
    return created.value;
  }

  describe('US-FL-01 View flight details', () => {
    it('US-FL-01-T01 returns every field of the contract, with codes, cities and airport names', async () => {
      const id = await scheduledFlight('MS781', '2027-12-10T07:00:00Z', '2027-12-10T12:00:00Z');

      const { body } = await http().get(`/flights/${id}`).expect(200);

      expect(body).toMatchObject({
        id,
        flightNumber: 'MS781',
        airline: { code: 'MS', name: 'EgyptAir' },
        origin: { code: 'CAI', city: 'Cairo', name: 'Cairo International Airport' },
        destination: { code: 'LHR', city: 'London', name: 'Heathrow Airport' },
        scheduledDepartureUtc: '2027-12-10T07:00:00.000Z',
        scheduledArrivalUtc: '2027-12-10T12:00:00.000Z',
        status: 'SCHEDULED',
      });
    });

    it('US-FL-01-T02 local times carry each airport offset; the duration comes from UTC (5 h, not 3 h)', async () => {
      const id = await scheduledFlight('MS782', '2027-12-10T07:00:00Z', '2027-12-10T12:00:00Z');

      const { body } = await http().get(`/flights/${id}`).expect(200);

      expect(body.scheduledDepartureLocal).toBe('2027-12-10T09:00+02:00');
      expect(body.scheduledArrivalLocal).toBe('2027-12-10T12:00+00:00');
      expect(body.durationMinutes).toBe(300);
    });

    it('US-FL-01-T05 a cancelled flight is still viewable and shows CANCELLED', async () => {
      const id = await scheduledFlight('MS783', '2027-12-10T07:00:00Z', '2027-12-10T12:00:00Z');
      await dataSource.transaction((tx) =>
        catalog.changeStatus(tx, id, FlightStatus.Cancelled, undefined, 'Technical fault'),
      );

      const { body } = await http().get(`/flights/${id}`).expect(200);

      expect(body.status).toBe('CANCELLED');
      expect(body.cancelReason).toBe('Technical fault');
    });
  });

  describe('US-FL-02 See current flight status', () => {
    it('US-FL-02-T04 the next read reflects the latest status update', async () => {
      const id = await scheduledFlight('MS784', '2027-12-10T07:00:00Z', '2027-12-10T12:00:00Z');
      expect((await http().get(`/flights/${id}`)).body.status).toBe('SCHEDULED');

      await dataSource.transaction((tx) =>
        catalog.changeStatus(tx, id, FlightStatus.Delayed, new Date('2027-12-10T08:30:00Z')),
      );

      const { body } = await http().get(`/flights/${id}`).expect(200);
      expect(body.status).toBe('DELAYED');
      expect(body.estimatedDepartureLocal).toBe('2027-12-10T10:30+02:00');
    });
  });

  describe('US-FL-03 Look up airports', () => {
    const suggest = async (q: string) =>
      (await http().get('/flights/airports/suggestions').query({ q }).expect(200)).body as {
        code: string;
      }[];

    it('US-FL-03-T01 one character returns nothing; two characters return matches', async () => {
      expect(await suggest('c')).toEqual([]);
      expect((await suggest('ca')).map((airport) => airport.code)).toContain('CAI');
    });

    it('US-FL-03-T02 matches a code prefix, a city or an airport name, ignoring case', async () => {
      expect((await suggest('lh')).map((airport) => airport.code)).toEqual(['LHR']);
      expect((await suggest('CAIRO')).map((airport) => airport.code)).toEqual(['CAI']);
      expect((await suggest('heathrow')).map((airport) => airport.code)).toEqual(['LHR']);
    });

    it('US-FL-03-T03 at most 10 suggestions, with an exact code match first', async () => {
      // "international" appears in more than 10 seeded airport names.
      expect(await suggest('international')).toHaveLength(10);

      await dataSource.transaction((tx) =>
        catalog.upsertAirport(tx, {
          code: 'AAA',
          name: 'SSH Heliport',
          city: 'Sharm El Sheikh',
          country: 'Egypt',
          timezone: 'Africa/Cairo',
        }),
      );
      expect((await suggest('ssh')).map((airport) => airport.code)).toEqual(['SSH', 'AAA']);
    });

    it('US-FL-03-T04 a query matching nothing is an empty list with a success status', async () => {
      expect(await suggest('zzzz')).toEqual([]);
    });
  });

  describe('NFR-PERF-01 route search uses the composite index', () => {
    it('NFR-PERF-01-T02 the planner can serve origin, destination and a departure range from one index', async () => {
      const plan = await dataSource.transaction(async (tx) => {
        await tx.query('SET LOCAL enable_seqscan = off');
        return tx.query<{ 'QUERY PLAN': string }[]>(
          `EXPLAIN SELECT * FROM "flights" WHERE "originCode" = $1 AND "destinationCode" = $2
           AND "scheduledDepartureUtc" >= $3 AND "scheduledDepartureUtc" < $4`,
          ['CAI', 'LHR', '2027-12-10T00:00:00Z', '2027-12-11T00:00:00Z'],
        );
      });
      expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain('flights_route_departure');
    });
  });
});
