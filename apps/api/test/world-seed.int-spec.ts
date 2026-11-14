import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INVENTORY_API, type InventoryApi } from '../src/modules/inventory/index';
import { WORLD_AIRPORTS } from '../src/database/world/airports';
import { buildWorldFlights } from '../src/database/world/network';
import { seedWorld } from '../src/database/world/seed-world';
import { localDateOf } from '../src/shared/time';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

// A slice of the world network: three hubs and the airports around them, over three days.
const CODES = ['CAI', 'DXB', 'IST', 'AMM', 'BEY', 'KWI', 'TBS', 'LCA'];
const AIRPORTS = WORLD_AIRPORTS.filter(([code]) => CODES.includes(code));
const DAYS = 3;

describe('NFR-PORT-01 the world network seeds through the Catalog and Inventory', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  const now = new Date();
  const expected = buildWorldFlights(now, DAYS, AIRPORTS);

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('NFR-PORT-01-T18 the Catalog accepts every airport and flight; airports already there are kept', async () => {
    const summary = await seedWorld(app, { now, days: DAYS, airports: AIRPORTS });

    expect(summary.flights.rejected).toEqual([]);
    expect(summary.flights.created).toBe(expected.length);
    // CAI, DXB and IST come with the reference data.
    expect(summary.airports).toEqual({ created: CODES.length - 3, existing: 3 });
  });

  it('NFR-PORT-01-T19 running the seed again changes nothing', async () => {
    const again = await seedWorld(app, { now, days: DAYS, airports: AIRPORTS });

    expect(again.flights).toEqual({ created: 0, existing: expected.length, rejected: [] });
    expect(again.airports).toEqual({ created: 0, existing: CODES.length });
  });

  it('NFR-PORT-01-T20 a seeded flight to a new airport can be found and has seats to book', async () => {
    const flight = expected.find((candidate) => candidate.destinationCode === 'AMM')!;
    const origin = AIRPORTS.find(([code]) => code === flight.originCode)!;
    const response = await request(app.getHttpServer())
      .get('/search/flights')
      .query({
        origin: flight.originCode,
        destination: 'AMM',
        date: localDateOf(flight.scheduledDepartureUtc, origin[4]),
      })
      .expect(200);
    const item = (
      response.body as { items: { flightId: string; flightNumber: string }[] }
    ).items.find((candidate) => candidate.flightNumber === flight.flightNumber);
    expect(item).toBeDefined();

    const availability = await app.get<InventoryApi>(INVENTORY_API).checkAvailability(
      (['ECONOMY', 'BUSINESS'] as const).map((cabin) => ({
        flightId: item!.flightId,
        cabin,
        passengers: { adults: 1 },
      })),
    );
    expect(availability.ok && availability.value.map((seats) => seats.availableSeats)).toEqual([
      flight.seats.ECONOMY,
      flight.seats.BUSINESS,
    ]);
  });
});
