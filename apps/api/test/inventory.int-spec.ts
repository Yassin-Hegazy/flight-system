import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import httpRequest from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDatabaseOptions } from '../src/database/database.options';
import { CreateInventory1794355200000 } from '../src/database/migrations/1794355200000-CreateInventory';
import { AddInventoryFlightForeignKey1794441600000 } from '../src/database/migrations/1794441600000-AddInventoryFlightForeignKey';
import {
  CATALOG_API,
  type Cabin,
  type CatalogApi,
  type PassengerMix,
} from '../src/modules/flight-catalog/index';
import {
  INVENTORY_API,
  InventoryFacade,
  InventoryModule,
  type AvailabilityRequest,
  type InventoryApi,
} from '../src/modules/inventory/index';
import type { Tx } from '../src/shared/db';
import { CLOCK } from '../src/shared/time';
import { money } from '../src/shared/money';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

// A separate module proves the exported boundary resolves for Search/Booking-like consumers.
@Injectable()
class AvailabilityConsumer {
  constructor(@Inject(INVENTORY_API) readonly inventory: InventoryApi) {}
}

@Module({ imports: [InventoryModule], providers: [AvailabilityConsumer] })
class ConsumerModule {}

const NOW = new Date('2026-11-11T12:00:00Z');
const FLIGHT = randomUUID();
const OTHER_FLIGHT = randomUUID();
const request = (
  flightId: string = FLIGHT,
  cabin: Cabin = 'ECONOMY',
  passengers: PassengerMix = { adults: 1 },
): AvailabilityRequest => ({ flightId, cabin, passengers });

describe('US-INV-01 Inventory against PostgreSQL', () => {
  let database: TestDatabase;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let inventory: InventoryApi;
  let now: Date;

  beforeAll(async () => {
    database = await startTestDatabase();
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...baseDatabaseOptions(database.url),
          autoLoadEntities: true,
          migrations: [CreateInventory1794355200000, AddInventoryFlightForeignKey1794441600000],
        }),
        ConsumerModule,
      ],
    })
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    await moduleRef.init();
    dataSource = moduleRef.get(DataSource);
    inventory = moduleRef.get(AvailabilityConsumer).inventory;
  });

  beforeEach(async () => {
    now = new Date(NOW);
    await dataSource.query('TRUNCATE "seat_holds", "cabin_inventory"');
    // This suite owns a disposable database. Keep the migration-seeded airlines/airports and
    // recreate real Catalog rows for every test, before inserting Inventory or holds.
    await dataSource.query('DELETE FROM "flights"');
    await dataSource.query(
      `INSERT INTO "flights" ("id", "flightNumber", "airlineCode", "originCode", "destinationCode",
         "scheduledDepartureUtc", "scheduledArrivalUtc", "departureLocalDate")
       VALUES ($1, 'MS921', 'MS', 'CAI', 'LHR', '2027-12-10T07:00:00Z', '2027-12-10T12:00:00Z', '2027-12-10'),
              ($2, 'MS922', 'MS', 'CAI', 'LHR', '2027-12-10T09:00:00Z', '2027-12-10T14:00:00Z', '2027-12-10')`,
      [FLIGHT, OTHER_FLIGHT],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await moduleRef?.close();
    await database?.stop();
  });

  async function capacity(
    flightId: string = FLIGHT,
    cabin: Cabin = 'ECONOMY',
    total = 10,
    committed = 3,
  ) {
    await dataSource.query(
      'INSERT INTO "cabin_inventory" ("flightId", "cabin", "capacity", "committedSeats") VALUES ($1, $2, $3, $4)',
      [flightId, cabin, total, committed],
    );
  }

  async function hold(
    options: {
      flightId?: string;
      cabin?: Cabin;
      seats?: number;
      status?: string;
      expiresAt?: Date;
    } = {},
    tx: Tx = dataSource.manager,
  ) {
    await tx.query(
      'INSERT INTO "seat_holds" ("bookingId", "flightId", "cabin", "seats", "status", "expiresAt") VALUES ($1, $2, $3, $4, $5, $6)',
      [
        randomUUID(),
        options.flightId ?? FLIGHT,
        options.cabin ?? 'ECONOMY',
        options.seats ?? 2,
        options.status ?? 'HELD',
        options.expiresAt ?? new Date(NOW.getTime() + 60_000),
      ],
    );
  }

  async function check(requests = [request()], tx?: Tx) {
    const result = await inventory.checkAvailability(requests, tx);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  it('US-INV-01-T01 AC-1/4 computes 10 - 3 - 2 = 5 through the public facade', async () => {
    await capacity();
    await hold({ seats: 1 });
    await hold({ seats: 1 });
    expect(inventory).toBe(moduleRef.get(InventoryFacade));
    expect(await check()).toEqual([
      {
        flightId: FLIGHT,
        cabin: 'ECONOMY',
        availableSeats: 5,
        requiredSeats: 1,
        canAccommodate: true,
        inventoryFound: true,
      },
    ]);
  });

  it('US-INV-01-T02 AC-1/2/4 isolates flights and cabins in one query, preserving duplicates and order', async () => {
    await capacity();
    await capacity(FLIGHT, 'BUSINESS', 4, 1);
    await capacity(OTHER_FLIGHT, 'ECONOMY', 20, 0);
    await hold();
    await hold({ cabin: 'BUSINESS', seats: 1 });
    await hold({ flightId: OTHER_FLIGHT, seats: 4 });
    const query = vi.spyOn(dataSource.manager, 'query');
    const result = await check([
      request(OTHER_FLIGHT),
      request(FLIGHT, 'BUSINESS'),
      request(),
      request(),
    ]);
    expect(result.map((row) => row.availableSeats)).toEqual([16, 2, 5, 5]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('US-INV-01-T03 AC-2 compares the requested seat count and excludes lap infants', async () => {
    await capacity();
    await hold();
    const result = await check([
      request(FLIGHT, 'ECONOMY', { adults: 1 }),
      request(FLIGHT, 'ECONOMY', { adults: 3, children: 2, infants: 3 }),
      request(FLIGHT, 'ECONOMY', { adults: 4, children: 2 }),
    ]);
    expect(
      result.map((row) => [row.requiredSeats, row.availableSeats, row.canAccommodate]),
    ).toEqual([
      [1, 5, true],
      [5, 5, true],
      [6, 5, false],
    ]);
  });

  it('US-INV-01-T04 AC-3 ignores expired and exactly-now holds without cleaning their HELD status', async () => {
    await capacity();
    await hold({ expiresAt: new Date(NOW.getTime() - 1) });
    await hold({ expiresAt: NOW });
    await hold({ seats: 1, expiresAt: new Date(NOW.getTime() + 1) });
    expect((await check())[0].availableSeats).toBe(6);
    now = new Date(NOW.getTime() + 1);
    expect((await check())[0].availableSeats).toBe(7);
    const rows = await dataSource.query<{ status: string }[]>('SELECT "status" FROM "seat_holds"');
    expect(rows.map((row) => row.status)).toEqual(['HELD', 'HELD', 'HELD']);
  });

  it('US-INV-01-T05 AC-1 counts only HELD, excluding all terminal statuses even before expiry', async () => {
    await capacity();
    for (const status of ['COMMITTED', 'RELEASED', 'EXPIRED']) await hold({ status });
    expect((await check())[0].availableSeats).toBe(7);
  });

  it('US-INV-01-T06 AC-1 clamps excessive holds to zero, including sums beyond integer range', async () => {
    await capacity();
    await hold({ seats: 2_147_483_647 });
    await hold({ seats: 2_147_483_647 });
    expect(await check()).toMatchObject([{ availableSeats: 0, canAccommodate: false }]);
  });

  it('US-INV-01-T07 AC-4 an empty flight list makes no query', async () => {
    const query = vi.spyOn(dataSource.manager, 'query');
    expect(await check([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('US-INV-01-T08 AC-1/4 missing flight/cabin records fail closed and differ from zero capacity', async () => {
    await capacity(FLIGHT, 'ECONOMY', 0, 0);
    expect(
      await check([request(), request(FLIGHT, 'BUSINESS'), request(OTHER_FLIGHT)]),
    ).toMatchObject([
      { inventoryFound: true, availableSeats: 0, canAccommodate: false },
      { inventoryFound: false, availableSeats: 0, canAccommodate: false },
      { inventoryFound: false, availableSeats: 0, canAccommodate: false },
    ]);
  });

  it.each([
    [{ ...request(), cabin: 'FIRST' }, 'INVALID_CABIN'],
    [{ ...request(), passengers: { adults: -1 } }, 'INVALID_PARTY'],
    [{ ...request(), passengers: { adults: 1, children: 0.5 } }, 'INVALID_PARTY'],
    [{ ...request(), passengers: { adults: 0, infants: 1 } }, 'INVALID_PARTY'],
    [{ ...request(), passengers: { adults: 1, infants: 2 } }, 'TOO_MANY_INFANTS'],
    [{ ...request(), flightId: 'invalid' }, 'INVALID_FLIGHT_ID'],
  ])(
    'US-INV-01-T09 AC-2/4 the facade rejects invalid batch input %j (%s)',
    async (invalid, error) => {
      const query = vi.spyOn(dataSource.manager, 'query');
      expect(
        await inventory.checkAvailability([request(), invalid as AvailabilityRequest]),
      ).toEqual({ ok: false, error });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    [-1, 0],
    [10, -1],
    [10, 11],
  ])(
    'US-INV-01-T10 AC-1 PostgreSQL rejects capacity %i with committed %i',
    async (total, committed) => {
      await expect(capacity(FLIGHT, 'ECONOMY', total, committed)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
    },
  );

  it('US-INV-01-T11 AC-1 PostgreSQL rejects duplicate cabins and invalid hold data', async () => {
    await capacity();
    await expect(capacity()).rejects.toMatchObject({ driverError: { code: '23505' } });
    await expect(hold({ seats: 0 })).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(hold({ seats: -1 })).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(hold({ status: 'UNKNOWN' })).rejects.toMatchObject({
      driverError: { code: '22P02' },
    });
    await expect(hold({ cabin: 'BUSINESS' })).rejects.toMatchObject({
      driverError: { code: '23503' },
    });
    await expect(capacity(OTHER_FLIGHT, 'FIRST' as Cabin)).rejects.toMatchObject({
      driverError: { code: '22P02' },
    });
  });

  it('US-INV-01-T12 AC-1/4 reads uncommitted holds through the supplied transaction and respects rollback', async () => {
    await capacity();
    const rollback = new Error('intentional rollback');
    await expect(
      dataSource.transaction(async (tx) => {
        await hold({}, tx);
        expect((await check([request()], tx))[0].availableSeats).toBe(5);
        expect((await check())[0].availableSeats).toBe(7);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect((await check())[0].availableSeats).toBe(7);
  });

  async function flightForeignKey() {
    return dataSource.query<
      {
        validated: boolean;
        deferrable: boolean;
        deleteAction: string;
        updateAction: string;
        definition: string;
      }[]
    >(`SELECT convalidated AS validated, condeferrable AS deferrable,
         confdeltype AS "deleteAction", confupdtype AS "updateAction",
         pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'cabin_inventory'::regclass AND conname = 'cabin_inventory_flight_fk'`);
  }

  async function expectFlightForeignKey() {
    expect(await flightForeignKey()).toEqual([
      {
        validated: true,
        deferrable: false,
        deleteAction: 'r',
        updateAction: 'a',
        definition: 'FOREIGN KEY ("flightId") REFERENCES flights(id) ON DELETE RESTRICT',
      },
    ]);
  }

  it('US-INV-01-T13 AC-1 schema parity permits only the verified migration-owned foreign key', async () => {
    await expectFlightForeignKey();
    const schemaDiff = await dataSource.driver.createSchemaBuilder().log();
    // TypeORM cannot model this FK without loading Catalog's private entity metadata.
    // Keep the complete diff assertion: no other drift is allowed. If a generated migration
    // drops the FK, both the definition assertion above and this exact diff assertion fail.
    expect(schemaDiff.upQueries.map((query) => query.query)).toEqual([
      'ALTER TABLE "cabin_inventory" DROP CONSTRAINT "cabin_inventory_flight_fk"',
    ]);
  });

  it('US-INV-01-T14 AC-1 both Inventory migrations revert and reapply in order without dropping Catalog', async () => {
    await dataSource.undoLastMigration(); // AddInventoryFlightForeignKey
    expect(await flightForeignKey()).toEqual([]);
    // Preserve the original CreateInventory rollback test, now that it is second-latest.
    await dataSource.undoLastMigration();
    const [row] = await dataSource.query<{ inventory: string | null; catalog: string | null }[]>(
      `SELECT to_regclass('public.cabin_inventory')::text AS inventory, to_regclass('public.flights')::text AS catalog`,
    );
    expect(row).toEqual({ inventory: null, catalog: 'flights' });
    const applied = await dataSource.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual([
      'CreateInventory1794355200000',
      'AddInventoryFlightForeignKey1794441600000',
    ]);
    await expectFlightForeignKey();
    await capacity();
    expect((await check())[0].availableSeats).toBe(7);
  });

  it('US-INV-01-T15 a valid Catalog flight accepts Inventory for both cabins', async () => {
    await capacity();
    await capacity(FLIGHT, 'BUSINESS', 4, 0);
    expect(await check([request(), request(FLIGHT, 'BUSINESS')])).toMatchObject([
      { inventoryFound: true, availableSeats: 7 },
      { inventoryFound: true, availableSeats: 4 },
    ]);
  });

  it('US-INV-01-T16 PostgreSQL rejects a nonexistent flight and persists no orphan', async () => {
    const missingFlight = randomUUID();
    await expect(capacity(missingFlight)).rejects.toMatchObject({
      driverError: { code: '23503', constraint: 'cabin_inventory_flight_fk' },
    });
    expect(
      await dataSource.query('SELECT * FROM "cabin_inventory" WHERE "flightId" = $1', [
        missingFlight,
      ]),
    ).toEqual([]);
  });

  it('US-INV-01-T17 deleting a referenced flight is rejected and both records survive', async () => {
    await capacity();
    await expect(
      dataSource.query('DELETE FROM "flights" WHERE "id" = $1', [FLIGHT]),
    ).rejects.toMatchObject({
      // PostgreSQL reports restrict_violation for this ON DELETE RESTRICT action.
      driverError: { code: '23001', constraint: 'cabin_inventory_flight_fk' },
    });
    expect(await dataSource.query('SELECT "id" FROM "flights" WHERE "id" = $1', [FLIGHT])).toEqual([
      { id: FLIGHT },
    ]);
    expect((await check())[0]).toMatchObject({ inventoryFound: true, availableSeats: 7 });
  });

  async function schemaObjects() {
    return {
      indexes: await dataSource.query(
        `SELECT tablename, indexname, indexdef FROM pg_indexes
         WHERE schemaname = 'public' AND tablename IN ('flights', 'cabin_inventory', 'seat_holds')
         ORDER BY tablename, indexname`,
      ),
      constraints: await dataSource.query(
        `SELECT conrelid::regclass::text AS "table", conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint WHERE conrelid IN ('flights'::regclass, 'cabin_inventory'::regclass, 'seat_holds'::regclass)
           AND conname <> 'cabin_inventory_flight_fk'
         ORDER BY conrelid::regclass::text, conname`,
      ),
    };
  }

  it('US-INV-01-T18 FK-only rollback/reapply preserves existing rows, tables, indexes and other constraints', async () => {
    await capacity();
    await hold();
    const before = await schemaObjects();
    const inventoryBefore = await dataSource.query('SELECT * FROM "cabin_inventory"');
    const holdsBefore = await dataSource.query('SELECT * FROM "seat_holds"');
    const flightsBefore = await dataSource.query('SELECT * FROM "flights" ORDER BY "id"');
    await expectFlightForeignKey();

    await dataSource.undoLastMigration();
    expect(await flightForeignKey()).toEqual([]);
    expect(await schemaObjects()).toEqual(before);
    expect((await check())[0].availableSeats).toBe(5);

    const applied = await dataSource.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual([
      'AddInventoryFlightForeignKey1794441600000',
    ]);
    await expectFlightForeignKey();
    expect(await schemaObjects()).toEqual(before);
    expect(await dataSource.query('SELECT * FROM "cabin_inventory"')).toEqual(inventoryBefore);
    expect(await dataSource.query('SELECT * FROM "seat_holds"')).toEqual(holdsBefore);
    expect(await dataSource.query('SELECT * FROM "flights" ORDER BY "id"')).toEqual(flightsBefore);
    expect((await check())[0].availableSeats).toBe(5);
  });

  it('US-INV-01-T19 migration refuses existing orphans clearly without changing any records', async () => {
    await capacity();
    await hold();
    await dataSource.undoLastMigration();
    const orphan = randomUUID();
    try {
      await capacity(orphan);
      const before = await dataSource.query('SELECT * FROM "cabin_inventory" ORDER BY "flightId"');
      const holdsBefore = await dataSource.query('SELECT * FROM "seat_holds"');
      await expect(dataSource.runMigrations()).rejects.toMatchObject({
        driverError: {
          code: '23503',
          constraint: 'cabin_inventory_flight_fk',
          message: `Cannot add cabin_inventory_flight_fk: cabin_inventory references missing flight ${orphan}.`,
          hint: expect.stringContaining('explicitly resolve orphaned Inventory records'),
        },
      });
      expect(await flightForeignKey()).toEqual([]);
      expect(await dataSource.query('SELECT * FROM "cabin_inventory" ORDER BY "flightId"')).toEqual(
        before,
      );
      expect(await dataSource.query('SELECT * FROM "seat_holds"')).toEqual(holdsBefore);
      expect(
        await dataSource.query('SELECT "name" FROM "migrations" WHERE "name" = $1', [
          'AddInventoryFlightForeignKey1794441600000',
        ]),
      ).toEqual([]);
    } finally {
      // Explicit cleanup of this test's intentional orphan; production migrations never do this.
      await dataSource.query('DELETE FROM "cabin_inventory" WHERE "flightId" = $1', [orphan]);
      await dataSource.runMigrations();
    }
    await expectFlightForeignKey();
    expect((await check())[0].availableSeats).toBe(5);
  });

  it('US-INV-01-T20 Catalog-created demo flights support Inventory and the existing HTTP reads', async () => {
    const app = await createTestApp(database.url);
    try {
      const catalog = app.get<CatalogApi>(CATALOG_API);
      const appDb = app.get(DataSource);
      const created = await appDb.transaction((tx) =>
        catalog.createFlight(tx, {
          flightNumber: 'MS925',
          airlineCode: 'MS',
          originCode: 'CAI',
          destinationCode: 'LHR',
          scheduledDepartureUtc: new Date('2027-12-10T07:00:00Z'),
          scheduledArrivalUtc: new Date('2027-12-10T12:00:00Z'),
          fares: { ECONOMY: money(10000, 'EGP'), BUSINESS: money(40000, 'EGP') },
        }),
      );
      if (!created.ok) throw new Error(created.error);
      await capacity(created.value);
      const result = await app
        .get<InventoryApi>(INVENTORY_API)
        .checkAvailability([request(created.value)]);
      expect(result).toMatchObject({
        ok: true,
        value: [{ inventoryFound: true, availableSeats: 7 }],
      });

      const details = await httpRequest(app.getHttpServer())
        .get(`/flights/${created.value}`)
        .expect(200);
      expect(details.body).toMatchObject({ id: created.value, flightNumber: 'MS925' });
      const listing = await httpRequest(app.getHttpServer())
        .get('/flights')
        .query({ origin: 'CAI', destination: 'LHR', date: '2027-12-10' })
        .expect(200);
      expect(listing.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.value })]),
      );
      await httpRequest(app.getHttpServer()).get('/health').expect(200);

      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('M2 check').setVersion('1').build(),
      );
      expect(document.paths['/flights/{id}']?.get).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('US-INV-01-T21 PostgreSQL prevents invalid Inventory references and referenced flight-ID updates', async () => {
    await capacity();
    const missingFlight = randomUUID();
    for (const sql of [
      'UPDATE "cabin_inventory" SET "flightId" = $1 WHERE "flightId" = $2',
      'UPDATE "flights" SET "id" = $1 WHERE "id" = $2',
    ]) {
      await expect(dataSource.query(sql, [missingFlight, FLIGHT])).rejects.toMatchObject({
        driverError: { code: '23503', constraint: 'cabin_inventory_flight_fk' },
      });
    }
    expect((await check())[0]).toMatchObject({ inventoryFound: true, availableSeats: 7 });
  });
});
