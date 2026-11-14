import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEMO_DAYS,
  DEMO_ROUTES,
  DEMO_SEATS,
  buildDemoFlights,
  seedDemo,
} from '../src/database/seed-demo';
import { INVENTORY_API, type InventoryApi } from '../src/modules/inventory/index';
import { localDateOf } from '../src/shared/time';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const ADMIN = { email: 'demo-admin@example.com', password: 'Admin-Seed-2026!', name: 'Admin' };
const TRAVELER = {
  email: 'demo-traveler@example.com',
  password: 'Traveler-Seed-2026!',
  name: 'Traveler',
};

describe('NFR-PORT-01 a fresh database becomes demo-ready with one seed', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  const now = new Date();

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('NFR-PORT-01-T03 the Catalog accepts every demo flight against the real airlines and airports', async () => {
    const summary = await seedDemo(app, { admin: ADMIN, traveler: TRAVELER, now });

    expect(summary.flights.rejected).toEqual([]);
    expect(summary.flights.created).toBe(DEMO_ROUTES.length * DEMO_DAYS);
    expect(summary.admin).toBe('created');
    expect(summary.traveler).toBe('created');
  });

  it('NFR-PORT-01-T04 running the seed again changes nothing', async () => {
    const again = await seedDemo(app, { admin: ADMIN, traveler: TRAVELER, now });

    expect(again.flights).toEqual({
      created: 0,
      existing: DEMO_ROUTES.length * DEMO_DAYS,
      rejected: [],
    });
    expect(again.admin).toBe('already-exists');
    expect(again.traveler).toBe('already-exists');
  });

  it('NFR-PORT-01-T05 the seeded flights can be searched by route and date', async () => {
    const flight = buildDemoFlights(now).find((candidate) => candidate.flightNumber === 'MS777')!;
    const date = localDateOf(flight.scheduledDepartureUtc, 'Africa/Cairo');

    const response = await request(app.getHttpServer())
      .get('/flights')
      .query({ origin: 'CAI', destination: 'LHR', date })
      .expect(200);

    expect(JSON.stringify(response.body)).toContain('MS777');
  });

  it('NFR-PORT-01-T21 every demo flight has seats in both cabins, so Search lists it and it can be booked', async () => {
    const flight = buildDemoFlights(now).find((candidate) => candidate.flightNumber === 'MS777')!;
    const response = await request(app.getHttpServer())
      .get('/search/flights')
      .query({
        origin: 'CAI',
        destination: 'LHR',
        date: localDateOf(flight.scheduledDepartureUtc, 'Africa/Cairo'),
      })
      .expect(200);
    const { flightId } = (response.body as { items: { flightId: string }[] }).items[0];

    const availability = await app.get<InventoryApi>(INVENTORY_API).checkAvailability(
      (['ECONOMY', 'BUSINESS'] as const).map((cabin) => ({
        flightId,
        cabin,
        passengers: { adults: 1 },
      })),
    );
    expect(availability.ok && availability.value.map((seats) => seats.availableSeats)).toEqual([
      DEMO_SEATS.ECONOMY,
      DEMO_SEATS.BUSINESS,
    ]);
  });

  it('NFR-PORT-01-T06 the seeded administrator and traveler can sign in', async () => {
    for (const account of [ADMIN, TRAVELER]) {
      await request(app.getHttpServer())
        .post('/users/sign-in')
        .set('x-requested-with', 'fetch')
        .send({ email: account.email, password: account.password })
        .expect(200);
    }
  });
});
