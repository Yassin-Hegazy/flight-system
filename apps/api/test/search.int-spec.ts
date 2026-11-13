import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { money } from '../src/shared/money';
import {
  CABINS,
  type Cabin,
  CATALOG_API,
  type CatalogApi,
} from '../src/modules/flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../src/modules/inventory/index';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

/**
 * Search against PostgreSQL through the real Catalog and Inventory. Each test uses its own dates in
 * December 2027, so the flights one test schedules never appear in another's results.
 */
describe('Search against PostgreSQL', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let catalog: CatalogApi;
  let inventory: InventoryApi;
  let dataSource: DataSource;

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    catalog = app.get<CatalogApi>(CATALOG_API);
    inventory = app.get<InventoryApi>(INVENTORY_API);
    dataSource = app.get(DataSource);
    // Airlines and airports (MS, BA, CAI, LHR, ...) come from the reference-data seed migration.
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  interface Scheduled {
    number: string;
    from: string;
    to: string;
    departs: string;
    seats?: Record<Cabin, number>;
    economyFare?: number;
  }

  /** Creates the flight and its cabins in one transaction, as Administration does. */
  const schedule = ({ number, from, to, departs, seats, economyFare = 1_500_000 }: Scheduled) =>
    dataSource.transaction('READ COMMITTED', async (tx) => {
      const departure = new Date(departs);
      const created = await catalog.createFlight(tx, {
        flightNumber: number,
        airlineCode: number.slice(0, 2),
        originCode: from,
        destinationCode: to,
        scheduledDepartureUtc: departure,
        scheduledArrivalUtc: new Date(departure.getTime() + 5 * 3_600_000),
        fares: { ECONOMY: money(economyFare, 'EGP'), BUSINESS: money(6_000_000, 'EGP') },
      });
      if (!created.ok) throw new Error(created.error);
      for (const cabin of CABINS) {
        const capacity = (seats ?? { ECONOMY: 50, BUSINESS: 8 })[cabin];
        const set = await inventory.setCapacity(tx, created.value, cabin, capacity);
        if (!set.ok) throw new Error(JSON.stringify(set.error));
      }
      return created.value;
    });

  const holdOneSeat = (flightId: string) =>
    dataSource.transaction('READ COMMITTED', (tx) =>
      inventory.hold(tx, { bookingId: randomUUID(), flightId, cabin: 'ECONOMY', seats: 1 }),
    );

  const search = (query: Record<string, string | number | string[]>) =>
    request(app.getHttpServer()).get('/search/flights').query(query);

  const ids = (body: unknown) =>
    (body as { items: { flightId: string }[] }).items.map((item) => item.flightId);

  describe('NFR-DATA-02 / US-FS-01 AC-1 the date is the origin airport’s local day', () => {
    it('NFR-DATA-02-T12 a 01:30 Cairo departure on the 10th appears for the 10th, not the 9th', async () => {
      // 23:30 UTC on 9 December is 01:30 on 10 December in Cairo (UTC+2).
      const id = await schedule({
        number: 'MS801',
        from: 'CAI',
        to: 'LHR',
        departs: '2027-12-09T23:30:00Z',
      });

      const tenth = await search({ origin: 'CAI', destination: 'LHR', date: '2027-12-10' });
      const ninth = await search({ origin: 'CAI', destination: 'LHR', date: '2027-12-09' });

      expect(tenth.status).toBe(200);
      expect(ids(tenth.body)).toContain(id);
      expect(tenth.body.items[0].departureLocal).toBe('2027-12-10T01:30+02:00');
      expect(ids(ninth.body)).not.toContain(id);
    });
  });

  describe('US-FS-01 search one-way flights', () => {
    it('US-FS-01-T16 only the right direction and day come back', async () => {
      const outbound = await schedule({
        number: 'MS811',
        from: 'CAI',
        to: 'LHR',
        departs: '2027-12-12T08:00:00Z',
      });
      const reverse = await schedule({
        number: 'BA811',
        from: 'LHR',
        to: 'CAI',
        departs: '2027-12-12T08:00:00Z',
      });
      await schedule({ number: 'MS812', from: 'CAI', to: 'LHR', departs: '2027-12-13T08:00:00Z' });

      const cairoToLondon = await search({ origin: 'CAI', destination: 'LHR', date: '2027-12-12' });
      const londonToCairo = await search({ origin: 'LHR', destination: 'CAI', date: '2027-12-12' });

      expect(ids(cairoToLondon.body)).toEqual([outbound]);
      expect(ids(londonToCairo.body)).toEqual([reverse]);
    });

    it('US-FS-01-T17 capacity boundary through real Inventory, an active hold included', async () => {
      const id = await schedule({
        number: 'MS821',
        from: 'CAI',
        to: 'LHR',
        departs: '2027-12-14T08:00:00Z',
        seats: { ECONOMY: 3, BUSINESS: 2 },
      });
      // 2 adults + 1 child need 3 seats; the infant sits on a lap.
      const family = {
        origin: 'CAI',
        destination: 'LHR',
        date: '2027-12-14',
        adults: 2,
        children: 1,
        infants: 1,
      };

      expect(ids((await search(family)).body)).toEqual([id]);

      expect((await holdOneSeat(id)).ok).toBe(true);
      expect(ids((await search(family)).body)).toEqual([]);
      expect(ids((await search({ ...family, children: 0 })).body)).toEqual([id]);
    });

    it('US-FS-01-T18 same airport, unknown airport and a past date are 400s with their codes', async () => {
      const cases = [
        [{ origin: 'CAI', destination: 'CAI', date: '2027-12-10' }, 'SAME_AIRPORT'],
        [{ origin: 'CAI', destination: 'XXX', date: '2027-12-10' }, 'UNKNOWN_AIRPORT'],
        [{ origin: 'CAI', destination: 'LHR', date: '2020-01-01' }, 'DATE_IN_PAST'],
      ] as const;
      for (const [query, code] of cases) {
        const response = await search(query);
        expect({ status: response.status, code: response.body.code }).toEqual({
          status: 400,
          code,
        });
        expect(response.body.requestId).toBe(response.headers['x-request-id']);
      }
    });

    it('US-FS-02-T15 a result carries integer minor units, ISO instants and the breakdown', async () => {
      const id = await schedule({
        number: 'MS841',
        from: 'CAI',
        to: 'LHR',
        departs: '2027-12-18T08:00:00Z',
        economyFare: 1_000_000,
      });

      const response = await search({
        origin: 'CAI',
        destination: 'LHR',
        date: '2027-12-18',
        adults: 2,
        children: 1,
        pageSize: 51,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ page: 1, pageSize: 50, total: 1, hasNext: false });
      expect(response.body.items[0]).toMatchObject({
        flightId: id,
        flightNumber: 'MS841',
        airline: { code: 'MS', name: 'EgyptAir' },
        departureUtc: '2027-12-18T08:00:00.000Z',
        durationMinutes: 300,
        stops: 0,
        cabin: 'ECONOMY',
        adultFare: { amountMinor: 1_000_000, currency: 'EGP' },
        total: { amountMinor: 2_750_000, currency: 'EGP' },
        breakdown: [
          { passengerType: 'ADULT', count: 2, amount: { amountMinor: 2_000_000, currency: 'EGP' } },
          { passengerType: 'CHILD', count: 1, amount: { amountMinor: 750_000, currency: 'EGP' } },
        ],
      });
    });
  });

  describe('US-FS-02 unsupported sort', () => {
    it('US-FS-02-T14 sort=CHEAPEST is a 400 listing the four supported keys', async () => {
      const response = await search({
        origin: 'CAI',
        destination: 'LHR',
        date: '2027-12-10',
        sort: 'CHEAPEST',
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('UNSUPPORTED_SORT');
      expect(response.body.message).toContain('PRICE, DURATION, DEPARTURE_TIME, ARRIVAL_TIME');
    });
  });

  describe('NFR-SEC-03 malformed and oversized criteria are 400s, never 500s', () => {
    it('NFR-SEC-03-T10 malformed fields are each reported', async () => {
      const response = await search({
        origin: 'CAIRO',
        destination: 'L1R',
        date: '2027-13-01',
        adults: 'two',
        cabin: 'FIRST',
        departFrom: '25:00',
        airlines: 'EGYPTAIR',
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(response.body.fieldErrors as object).sort()).toEqual(
        ['adults', 'airlines', 'cabin', 'date', 'departFrom', 'destination', 'origin'].sort(),
      );
    });

    it('NFR-SEC-03-T11 oversized strings, lists and numbers, and repeated fields, are rejected', async () => {
      const base = { origin: 'CAI', destination: 'LHR', date: '2027-12-10' };
      const cases: [Record<string, string | number | string[]>, string][] = [
        [{ ...base, sort: 'X'.repeat(5000) }, 'sort'],
        [{ ...base, airlines: Array.from({ length: 21 }, () => 'MS').join(',') }, 'airlines'],
        [{ ...base, pageSize: 1e12 }, 'pageSize'],
        [{ ...base, page: 1e12 }, 'page'],
        [{ ...base, maxTotal: 1e15 }, 'maxTotal'],
        [{ ...base, adults: 1000 }, 'adults'],
        [{ ...base, origin: ['CAI', 'LHR'] }, 'origin'],
      ];
      for (const [query, field] of cases) {
        const response = await search(query);
        expect({ field, status: response.status }).toEqual({ field, status: 400 });
        expect(Object.keys((response.body.fieldErrors ?? {}) as object)).toContain(field);
      }
    });

    it('NFR-SEC-03-T12 missing required fields are each reported', async () => {
      const response = await search({});

      expect(response.status).toBe(400);
      expect(Object.keys(response.body.fieldErrors as object).sort()).toEqual([
        'date',
        'destination',
        'origin',
      ]);
    });
  });

  describe('US-FS-06 search round trips', () => {
    it('US-FS-06-T08 returns both legs, and rejects a return before the outbound', async () => {
      const out = await schedule({
        number: 'MS831',
        from: 'CAI',
        to: 'LHR',
        departs: '2027-12-16T08:00:00Z',
      });
      const back = await schedule({
        number: 'BA831',
        from: 'LHR',
        to: 'CAI',
        departs: '2027-12-20T10:00:00Z',
      });
      const trip = { origin: 'CAI', destination: 'LHR', date: '2027-12-16' };

      const response = await request(app.getHttpServer())
        .get('/search/round-trip')
        .query({ ...trip, returnDate: '2027-12-20', inboundSort: 'ARRIVAL_TIME' });
      const backwards = await request(app.getHttpServer())
        .get('/search/round-trip')
        .query({ ...trip, returnDate: '2027-12-15' });

      expect(response.status).toBe(200);
      expect(ids(response.body.outbound)).toEqual([out]);
      expect(ids(response.body.inbound)).toEqual([back]);
      expect(response.body.inbound.sort).toBe('ARRIVAL_TIME');
      expect([backwards.status, backwards.body.code]).toEqual([400, 'RETURN_BEFORE_OUTBOUND']);
    });
  });
});
