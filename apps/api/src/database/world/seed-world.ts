import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CABINS,
  CATALOG_API,
  type CatalogApi,
  type CreateFlightError,
} from '../../modules/flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../../modules/inventory/index';
import type { Tx } from '../../shared/db';
import type { FlightSeedResult } from '../seed-demo';
import { WORLD_AIRPORTS, type WorldAirport } from './airports';
import { WORLD_DAYS, buildWorldFlights, type WorldFlight } from './network';

/** Flights per transaction: few enough to keep each short, enough to make 50,000 quick. */
const BATCH = 500;
/** Transactions running at once. */
const WORKERS = 4;

export interface WorldSeedOptions {
  now?: Date;
  days?: number;
  /** Defaults to the whole snapshot; tests pass a handful. */
  airports?: readonly WorldAirport[];
  /** Called after each batch, for a progress line. */
  onProgress?: (done: number, total: number) => void;
}

export interface WorldSeedResult {
  airports: { created: number; existing: number };
  flights: FlightSeedResult;
}

/**
 * Seeds the world network through the Catalog and Inventory public APIs, like an administrator
 * would: airports first, then each flight with its fares and seats. Safe to run again: airports
 * already there keep their details, and flights already there are counted, not repeated.
 */
export async function seedWorld(
  app: INestApplicationContext,
  options: WorldSeedOptions = {},
): Promise<WorldSeedResult> {
  const airports = options.airports ?? WORLD_AIRPORTS;
  const dataSource = app.get(DataSource);
  const catalog = app.get<CatalogApi>(CATALOG_API);
  const inventory = app.get<InventoryApi>(INVENTORY_API);

  const airportResult = await seedAirports(dataSource, catalog, airports);
  const flights = buildWorldFlights(
    options.now ?? new Date(),
    options.days ?? WORLD_DAYS,
    airports,
  );
  const result: FlightSeedResult = { created: 0, existing: 0, rejected: [] };
  const batches: WorldFlight[][] = [];
  for (let start = 0; start < flights.length; start += BATCH) {
    batches.push(flights.slice(start, start + BATCH));
  }
  let done = 0;
  // Batches touch different flights, so a few run side by side; the pool has ten connections.
  const worker = async () => {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      const flightsInBatch = batch;
      await dataSource.transaction(async (tx) => {
        for (const flight of flightsInBatch) {
          await seedFlight(tx, catalog, inventory, flight, result);
        }
      });
      done += flightsInBatch.length;
      options.onProgress?.(done, flights.length);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return { airports: airportResult, flights: result };
}

/** Only airports the database lacks: one an administrator already edited stays as it is. */
async function seedAirports(
  dataSource: DataSource,
  catalog: CatalogApi,
  airports: readonly WorldAirport[],
): Promise<WorldSeedResult['airports']> {
  const known = new Set(
    (await catalog.getAirports(airports.map(([code]) => code))).map((airport) => airport.code),
  );
  const missing = airports.filter(([code]) => !known.has(code));
  await dataSource.transaction(async (tx) => {
    for (const [code, name, city, country, timezone] of missing) {
      const saved = await catalog.upsertAirport(tx, { code, name, city, country, timezone });
      if (!saved.ok) throw new Error(`The Catalog refused airport ${code}: ${saved.error}`);
    }
  });
  return { created: missing.length, existing: known.size };
}

/**
 * One flight inside the batch's transaction. A duplicate fails its INSERT, which would abort the
 * whole transaction in PostgreSQL, so each flight runs inside its own savepoint.
 */
async function seedFlight(
  tx: Tx,
  catalog: CatalogApi,
  inventory: InventoryApi,
  flight: WorldFlight,
  result: FlightSeedResult,
): Promise<void> {
  await tx.query('SAVEPOINT world_flight');
  const created = await catalog.createFlight(tx, flight);
  if (!created.ok) {
    await tx.query('ROLLBACK TO SAVEPOINT world_flight');
    record(result, flight, created.error);
    return;
  }
  for (const cabin of CABINS) {
    const seats = await inventory.setCapacity(tx, created.value, cabin, flight.seats[cabin]);
    if (!seats.ok) throw new Error(`Inventory refused seats for ${flight.flightNumber}`);
  }
  await tx.query('RELEASE SAVEPOINT world_flight');
  result.created += 1;
}

function record(result: FlightSeedResult, flight: WorldFlight, error: CreateFlightError): void {
  if (error === 'DUPLICATE_FLIGHT') {
    result.existing += 1;
    return;
  }
  result.rejected.push({
    flightNumber: flight.flightNumber,
    departure: flight.scheduledDepartureUtc.toISOString(),
    reason: error,
  });
}
