import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDateOf } from '../src/shared/time';
import { CATALOG_API, type CatalogApi } from '../src/modules/flight-catalog/index';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

/**
 * NFR-PERF-01 benchmark: search p95 at or under 500 ms with 10,000 flights over 100 airports.
 * Slow to seed, so it runs only when asked:
 *
 *   RUN_BENCHMARK=1 pnpm --filter api exec vitest run --config vitest.integration.config.mts test/search.bench.int-spec.ts
 *   ($env:RUN_BENCHMARK=1 in PowerShell)
 *
 * Airports go through the Catalog's public upsertAirport. The 10,000 flights, their fares and
 * their cabins are bulk-inserted with SQL: this is a fixture, and going through createFlight one
 * by one would only measure the seeding. The searches themselves go through HTTP, end to end.
 */
const FLIGHTS = 10_000;
const AIRPORTS = 100;
const ROUTES = 250;
const DAYS = 10;
const SEARCHES = 200;
const P95_LIMIT_MS = 500;

const ZONES = ['Africa/Cairo', 'Europe/London', 'Asia/Dubai', 'America/New_York', 'Asia/Tokyo'];
const SORTS = ['PRICE', 'DURATION', 'DEPARTURE_TIME', 'ARRIVAL_TIME'];

/** Deterministic, so every run measures the same searches. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

interface Airport {
  code: string;
  timezone: string;
}

interface SeededFlight {
  origin: Airport;
  destination: Airport;
  localDate: string;
}

describe.skipIf(!process.env.RUN_BENCHMARK)('NFR-PERF-01 search benchmark', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const random = seededRandom(20271201);
  const seeded: SeededFlight[] = [];

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    dataSource = app.get(DataSource);
    const catalog = app.get<CatalogApi>(CATALOG_API);

    const airports = await seedAirports(catalog);
    const airlines = await dataSource.query<{ code: string }[]>(
      'SELECT "code" FROM "airlines" ORDER BY "code"',
    );
    await seedFlights(
      airports,
      airlines.map((airline) => airline.code),
    );
  }, 600_000);

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  async function seedAirports(catalog: CatalogApi): Promise<Airport[]> {
    const existing = await dataSource.query<Airport[]>('SELECT "code", "timezone" FROM "airports"');
    const airports = [...existing];
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; airports.length < AIRPORTS; i += 1) {
      const code = `Q${letters[Math.floor(i / 26) % 26]}${letters[i % 26]}`;
      if (airports.some((airport) => airport.code === code)) continue;
      const timezone = ZONES[i % ZONES.length];
      const saved = await dataSource.transaction((tx) =>
        catalog.upsertAirport(tx, {
          code,
          name: `Bench ${code}`,
          city: code,
          country: 'Bench',
          timezone,
        }),
      );
      if (!saved.ok) throw new Error(saved.error);
      airports.push({ code, timezone });
    }
    return airports;
  }

  async function seedFlights(airports: Airport[], airlines: string[]) {
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
    const routes = Array.from({ length: ROUTES }, () => {
      const origin = pick(airports);
      let destination = pick(airports);
      while (destination.code === origin.code) destination = pick(airports);
      return { origin, destination };
    });

    const columns = {
      id: [] as string[],
      number: [] as string[],
      airline: [] as string[],
      origin: [] as string[],
      destination: [] as string[],
      departure: [] as string[],
      arrival: [] as string[],
      localDate: [] as string[],
      fare: [] as number[],
    };
    for (let i = 0; i < FLIGHTS; i += 1) {
      const { origin, destination } = routes[i % ROUTES];
      const airline = airlines[i % airlines.length];
      const departure = new Date(
        Date.UTC(
          2027,
          2,
          1 + Math.floor(random() * DAYS),
          Math.floor(random() * 24),
          Math.floor(random() * 12) * 5,
        ),
      );
      const arrival = new Date(departure.getTime() + (60 + Math.floor(random() * 600)) * 60_000);
      const localDate = localDateOf(departure, origin.timezone);
      columns.id.push(randomUUID());
      // Unique across the whole set, so (number, local date) is never duplicated.
      columns.number.push(`${airline}${Math.floor(i / airlines.length) + 1}`);
      columns.airline.push(airline);
      columns.origin.push(origin.code);
      columns.destination.push(destination.code);
      columns.departure.push(departure.toISOString());
      columns.arrival.push(arrival.toISOString());
      columns.localDate.push(localDate);
      columns.fare.push(500_000 + Math.floor(random() * 40) * 50_000);
      seeded.push({ origin, destination, localDate });
    }

    await dataSource.query(
      `INSERT INTO "flights" ("id", "flightNumber", "airlineCode", "originCode", "destinationCode",
         "scheduledDepartureUtc", "scheduledArrivalUtc", "departureLocalDate")
       SELECT * FROM unnest($1::uuid[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
         $6::timestamptz[], $7::timestamptz[], $8::date[])`,
      [
        columns.id,
        columns.number,
        columns.airline,
        columns.origin,
        columns.destination,
        columns.departure,
        columns.arrival,
        columns.localDate,
      ],
    );
    await dataSource.query(
      `INSERT INTO "flight_fares" ("flightId", "cabin", "amountMinor", "currency")
       SELECT id, 'ECONOMY'::flight_fares_cabin_enum, fare, 'EGP' FROM unnest($1::uuid[], $2::int[]) AS t(id, fare)
       UNION ALL
       SELECT id, 'BUSINESS'::flight_fares_cabin_enum, fare * 4, 'EGP' FROM unnest($1::uuid[], $2::int[]) AS t(id, fare)`,
      [columns.id, columns.fare],
    );
    await dataSource.query(
      `INSERT INTO "cabin_inventory" ("flightId", "cabin", "capacity")
       SELECT id, 'ECONOMY'::inventory_cabin_enum, 150 FROM unnest($1::uuid[]) AS id
       UNION ALL
       SELECT id, 'BUSINESS'::inventory_cabin_enum, 12 FROM unnest($1::uuid[]) AS id`,
      [columns.id],
    );
    await dataSource.query('ANALYZE');
  }

  it('NFR-PERF-01-T04 200 random searches over 10,000 flights and 100 airports: p95 ≤ 500 ms', async () => {
    const server = app.getHttpServer();
    const timings: number[] = [];
    let results = 0;
    for (let i = 0; i < SEARCHES; i += 1) {
      const target = seeded[Math.floor(random() * seeded.length)];
      const started = performance.now();
      const response = await request(server)
        .get('/search/flights')
        .query({
          origin: target.origin.code,
          destination: target.destination.code,
          date: target.localDate,
          adults: 1 + Math.floor(random() * 3),
          children: Math.floor(random() * 2),
          cabin: random() < 0.8 ? 'ECONOMY' : 'BUSINESS',
          sort: SORTS[i % SORTS.length],
        });
      timings.push(performance.now() - started);
      expect(response.status).toBe(200);
      results += (response.body as { total: number }).total;
    }

    timings.sort((a, b) => a - b);
    const at = (fraction: number) => timings[Math.ceil(fraction * timings.length) - 1];
    const report = {
      searches: SEARCHES,
      meanResults: +(results / SEARCHES).toFixed(1),
      p50: Math.round(at(0.5)),
      p95: Math.round(at(0.95)),
      max: Math.round(timings[timings.length - 1]),
    };
    // Straight to stdout: Vitest swallows console output from passing tests.
    process.stdout.write(`NFR-PERF-01 search benchmark (ms): ${JSON.stringify(report)}\n`);

    expect(results).toBeGreaterThan(0);
    expect(report.p95).toBeLessThanOrEqual(P95_LIMIT_MS);
  }, 300_000);
});
