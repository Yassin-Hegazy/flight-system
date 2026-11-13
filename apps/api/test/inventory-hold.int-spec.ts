import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDatabaseOptions } from '../src/database/database.options';
import {
  INVENTORY_API,
  InventoryModule,
  type HoldRequest,
  type InventoryApi,
} from '../src/modules/inventory/index';
import type { Cabin } from '../src/modules/flight-catalog/index';
import type { Tx } from '../src/shared/db';
import { CLOCK } from '../src/shared/time';
import { startTestDatabase, type TestDatabase } from './support/postgres';

@Injectable()
class ReservationConsumer {
  constructor(@Inject(INVENTORY_API) readonly inventory: InventoryApi) {}
}

@Module({ imports: [InventoryModule], providers: [ReservationConsumer] })
class ConsumerModule {}

const FLIGHT = '00000000-0000-4000-8000-000000000001';
const OTHER_FLIGHT = '00000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-11-12T12:00:00Z');
const input = (overrides: Partial<HoldRequest> = {}): HoldRequest => ({
  bookingId: randomUUID(),
  flightId: FLIGHT,
  cabin: 'ECONOMY',
  seats: 1,
  ...overrides,
});

describe('US-INV-02 prevent overselling against PostgreSQL', () => {
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
          // All 50 stress attempts must reach BEGIN on distinct PostgreSQL connections before
          // the start barrier opens. This test-only pool prevents client-side serialization.
          extra: { max: 55 },
        }),
        ConsumerModule,
      ],
    })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(now) })
      .compile();
    await moduleRef.init();
    dataSource = moduleRef.get(DataSource);
    inventory = moduleRef.get(ReservationConsumer).inventory;
  });

  beforeEach(async () => {
    now = new Date(NOW);
    await dataSource.query(
      'TRUNCATE "refunds", "payments", "bookings", "seat_holds", "cabin_inventory"',
    );
    await dataSource.query('DELETE FROM "flights"');
    await dataSource.query(
      `INSERT INTO "flights" ("id", "flightNumber", "airlineCode", "originCode", "destinationCode",
         "scheduledDepartureUtc", "scheduledArrivalUtc", "departureLocalDate")
       VALUES ($1, 'MS931', 'MS', 'CAI', 'LHR', '2027-12-10T07:00:00Z', '2027-12-10T12:00:00Z', '2027-12-10'),
              ($2, 'MS932', 'MS', 'CAI', 'LHR', '2027-12-10T09:00:00Z', '2027-12-10T14:00:00Z', '2027-12-10')`,
      [FLIGHT, OTHER_FLIGHT],
    );
    await dataSource.query(
      `INSERT INTO "cabin_inventory" ("flightId", "cabin", "capacity", "committedSeats")
       VALUES ($1, 'ECONOMY', 10, 0), ($1, 'BUSINESS', 4, 0), ($2, 'ECONOMY', 10, 0)`,
      [FLIGHT, OTHER_FLIGHT],
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await database?.stop();
  });

  const hold = (request = input()) =>
    dataSource.transaction('READ COMMITTED', (tx) => inventory.hold(tx, request));

  async function available(flightId = FLIGHT, cabin: Cabin = 'ECONOMY', tx?: Tx) {
    const result = await inventory.checkAvailability(
      [{ flightId, cabin, passengers: { adults: 1 } }],
      tx,
    );
    if (!result.ok) throw new Error(result.error);
    return result.value[0].availableSeats;
  }

  async function setCapacity(capacity: number, committed = 0) {
    await dataSource.query(
      'UPDATE "cabin_inventory" SET "capacity" = $1, "committedSeats" = $2 WHERE "flightId" = $3 AND "cabin" = \'ECONOMY\'',
      [capacity, committed, FLIGHT],
    );
  }

  async function activeSeats() {
    const [row] = await dataSource.query<{ holds: number; seats: number }[]>(
      `SELECT COUNT(*)::integer AS holds, COALESCE(SUM("seats"), 0)::integer AS seats FROM "seat_holds"
       WHERE "flightId" = $1 AND "cabin" = 'ECONOMY' AND "status" = 'HELD' AND "expiresAt" > $2`,
      [FLIGHT, now],
    );
    return row;
  }

  async function closeRunner(runner: QueryRunner) {
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      if (!runner.isReleased) await runner.release();
    }
  }

  async function runners(count: number) {
    const connections = Array.from({ length: count }, () => dataSource.createQueryRunner());
    const opened = await Promise.allSettled(
      connections.map(async (runner) => {
        await runner.connect();
        await runner.startTransaction('READ COMMITTED');
        await runner.query("SET LOCAL lock_timeout = '10s'");
        await runner.query("SET LOCAL statement_timeout = '15s'");
        const [info] = await runner.manager.query<{ pid: number; isolation: string }[]>(
          "SELECT pg_backend_pid() AS pid, current_setting('transaction_isolation') AS isolation",
        );
        expect(info.isolation).toBe('read committed');
        return { runner, pid: info.pid };
      }),
    );
    if (opened.some((result) => result.status === 'rejected')) {
      await Promise.all(connections.map(closeRunner));
      throw new AggregateError(
        opened
          .filter((result) => result.status === 'rejected')
          .map((result): unknown => result.reason),
        'Could not start independent transactions',
      );
    }
    const ready = opened.map((result) => {
      if (result.status !== 'fulfilled') throw new Error('Transaction did not start');
      return result.value;
    });
    expect(new Set(ready.map(({ pid }) => pid)).size).toBe(count);
    return ready;
  }

  async function reserveTogether(
    count: number,
    reserve: (tx: Tx, attempt: number) => ReturnType<InventoryApi['hold']> = (tx) =>
      inventory.hold(tx, input()),
  ) {
    const ready = await runners(count);
    const gate = Promise.withResolvers<void>();
    const operations = ready.map(async ({ runner }, attempt) => {
      await gate.promise;
      try {
        const result = await reserve(runner.manager, attempt);
        if (result.ok) await runner.commitTransaction();
        else await runner.rollbackTransaction();
        return result;
      } finally {
        await closeRunner(runner);
      }
    });
    gate.resolve();
    // Wait for every transaction to finish even on an unexpected error, before resetting fixtures.
    const results = await Promise.allSettled(operations);
    const errors = results.filter((result) => result.status === 'rejected');
    expect(errors, 'unexpected transaction errors').toEqual([]);
    return results.map((result) => {
      if (result.status !== 'fulfilled') throw new Error('Reservation failed unexpectedly');
      return result.value;
    });
  }

  it('US-INV-02-T01 AC-1 rejects a stale Search availability result after another transaction reserves', async () => {
    await setCapacity(1);
    expect(await available()).toBe(1);
    expect((await hold()).ok).toBe(true);
    expect(await hold()).toEqual({ ok: false, error: 'SEATS_UNAVAILABLE' });
    expect(await activeSeats()).toEqual({ holds: 1, seats: 1 });
    expect(await available()).toBe(0);
  });

  it('US-INV-02-T02 AC-2 the database rejects committed seats above capacity and accepts both boundaries', async () => {
    await setCapacity(10, 0);
    await setCapacity(10, 10);
    await expect(setCapacity(10, 11)).rejects.toMatchObject({
      driverError: { code: '23514', constraint: 'cabin_inventory_committed_valid' },
    });
    expect(await available()).toBe(0);
    await setCapacity(10, 0);
    expect(await available()).toBe(10);
  });

  it('US-INV-02-T03 AC-3 two simultaneous independent transactions compete for the final seat', async () => {
    await setCapacity(1);
    const results = await reserveTogether(2);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: 'SEATS_UNAVAILABLE' },
    ]);
    expect(await activeSeats()).toEqual({ holds: 1, seats: 1 });
    expect(await available()).toBe(0);
  });

  it('US-INV-02-T04 AC-4 failure after a successful hold rolls back all Inventory state', async () => {
    await setCapacity(10, 3);
    const failure = new Error('simulated booking failure');
    await expect(
      dataSource.transaction('READ COMMITTED', async (tx) => {
        expect((await inventory.hold(tx, input({ seats: 2 }))).ok).toBe(true);
        expect(await available(FLIGHT, 'ECONOMY', tx)).toBe(5);
        expect(await available()).toBe(7); // A separate connection sees only committed data.
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await dataSource.query('SELECT * FROM "seat_holds"')).toEqual([]);
    expect(await available()).toBe(7);
    expect(
      await dataSource.query(
        'SELECT "committedSeats" FROM "cabin_inventory" WHERE "flightId" = $1 AND "cabin" = \'ECONOMY\'',
        [FLIGHT],
      ),
    ).toEqual([{ committedSeats: 3 }]);
  });

  it.each([
    [2, true],
    [3, true],
    [4, false],
  ])('US-INV-02-T05 AC-1 BVA requests %i when three seats remain', async (seats, succeeds) => {
    await setCapacity(3);
    const result = await hold(input({ seats }));
    if (succeeds) expect(result.ok).toBe(true);
    else expect(result).toEqual({ ok: false, error: 'SEATS_UNAVAILABLE' });
    expect(await available()).toBe(succeeds ? 3 - seats : 3);
    expect(await activeSeats()).toEqual({ holds: succeeds ? 1 : 0, seats: succeeds ? seats : 0 });
  });

  it('US-INV-02-T06 AC-1 counts committed and active holds, ignoring expired, exact-time and terminal holds', async () => {
    await setCapacity(10, 2);
    for (const [seats, status, offset] of [
      [3, 'HELD', 60_000],
      [7, 'HELD', -1],
      [7, 'HELD', 0],
      [7, 'RELEASED', 60_000],
      [7, 'COMMITTED', 60_000],
      [7, 'EXPIRED', 60_000],
    ] as const) {
      await dataSource.query(
        'INSERT INTO "seat_holds" ("bookingId", "flightId", "cabin", "seats", "status", "expiresAt") VALUES ($1, $2, \'ECONOMY\', $3, $4, $5)',
        [randomUUID(), FLIGHT, seats, status, new Date(now.getTime() + offset)],
      );
    }
    expect((await hold(input({ seats: 5 }))).ok).toBe(true);
    expect(await available()).toBe(0);
    expect(await activeSeats()).toEqual({ holds: 2, seats: 8 });
  });

  it('US-INV-02-T07 AC-1 samples time after a real lock wait; a hold expiring during the wait no longer counts', async () => {
    await setCapacity(1);
    const [first, second] = await runners(2);
    let pending: Promise<Awaited<ReturnType<InventoryApi['hold']>>> | undefined;
    try {
      expect((await inventory.hold(first.runner.manager, input({ durationSeconds: 1 }))).ok).toBe(
        true,
      );
      pending = inventory.hold(second.runner.manager, input());
      // Observe actual server blocking, not an arbitrary timing delay.
      await vi.waitFor(
        async () => {
          const [row] = await dataSource.query<{ blocked: boolean }[]>(
            'SELECT $1::integer = ANY(pg_blocking_pids($2)) AS blocked',
            [first.pid, second.pid],
          );
          expect(row.blocked).toBe(true);
        },
        { timeout: 5000, interval: 20 },
      );
      now = new Date(NOW.getTime() + 1000);
      await first.runner.commitTransaction();
      const result = await pending;
      expect(result.ok).toBe(true);
      await second.runner.commitTransaction();
      expect(await activeSeats()).toEqual({ holds: 1, seats: 1 });
      if (!result.ok) throw new Error(result.error);
      expect(
        await dataSource.query('SELECT "expiresAt" FROM "seat_holds" WHERE "id" = $1', [
          result.value,
        ]),
      ).toEqual([{ expiresAt: new Date(now.getTime() + 900_000) }]);
    } finally {
      await closeRunner(first.runner);
      if (pending) await pending.catch(() => undefined);
      await closeRunner(second.runner);
    }
  });

  it.each([
    { flightId: FLIGHT, cabin: 'BUSINESS' as const },
    { flightId: OTHER_FLIGHT, cabin: 'ECONOMY' as const },
  ])(
    'US-INV-02-T08 AC-3 independent flight/cabin %j is not blocked by an Economy reservation',
    async (target) => {
      const [{ runner }] = await runners(1);
      try {
        expect((await inventory.hold(runner.manager, input({ seats: 10 }))).ok).toBe(true);
        const result = await dataSource.transaction('READ COMMITTED', async (tx) => {
          await tx.query("SET LOCAL lock_timeout = '1s'");
          return inventory.hold(tx, input(target));
        });
        expect(result.ok).toBe(true);
        expect(await available(target.flightId, target.cabin)).toBe(
          target.cabin === 'BUSINESS' ? 3 : 9,
        );
      } finally {
        await closeRunner(runner);
      }
    },
  );

  it.each([{ flightId: randomUUID() }, { flightId: OTHER_FLIGHT, cabin: 'BUSINESS' as const }])(
    'US-INV-02-T09 AC-1 missing Inventory %j fails closed',
    async (target) => {
      expect(await hold(input(target))).toEqual({ ok: false, error: 'INVENTORY_NOT_FOUND' });
      expect(await dataSource.query('SELECT * FROM "seat_holds"')).toEqual([]);
    },
  );

  it.each([
    [{ seats: 0 }, 'INVALID_SEAT_COUNT'],
    [{ seats: -1 }, 'INVALID_SEAT_COUNT'],
    [{ seats: 0.5 }, 'INVALID_SEAT_COUNT'],
    [{ seats: 2_147_483_648 }, 'INVALID_SEAT_COUNT'],
    [{ durationSeconds: 0 }, 'INVALID_HOLD_DURATION'],
    [{ durationSeconds: Number.MAX_SAFE_INTEGER }, 'INVALID_HOLD_DURATION'],
    [{ bookingId: 'bad' }, 'INVALID_BOOKING_ID'],
    [{ cabin: 'FIRST' }, 'INVALID_CABIN'],
  ])('US-INV-02-T10 AC-1 rejects invalid input %j without writing (%s)', async (fields, error) => {
    expect(await hold({ ...input(), ...fields } as HoldRequest)).toEqual({ ok: false, error });
    expect(await dataSource.query('SELECT * FROM "seat_holds"')).toEqual([]);
  });

  it('US-INV-02-T11 AC-4 refuses autocommit or completed transactions', async () => {
    await expect(inventory.hold(dataSource.manager, input())).rejects.toThrow(
      'active caller transaction',
    );
    const [{ runner }] = await runners(1);
    try {
      await runner.commitTransaction();
      await expect(inventory.hold(runner.manager, input())).rejects.toThrow(
        'active caller transaction',
      );
    } finally {
      await closeRunner(runner);
    }
    expect(await activeSeats()).toEqual({ holds: 0, seats: 0 });
  });

  it.each(['REPEATABLE READ', 'SERIALIZABLE'] as const)(
    'US-INV-02-T12 AC-1 refuses unsupported %s snapshots',
    async (isolation) => {
      await expect(
        dataSource.transaction(isolation, (tx) => inventory.hold(tx, input())),
      ).rejects.toThrow('READ COMMITTED');
      expect(await activeSeats()).toEqual({ holds: 0, seats: 0 });
    },
  );

  it('US-INV-02-T13 AC-4 the caller rolls back earlier holds when a later request is unavailable', async () => {
    expect((await hold(input({ flightId: OTHER_FLIGHT, seats: 10 }))).ok).toBe(true);
    const bookingId = randomUUID();
    const rejected = new Error('booking rejected');
    await expect(
      dataSource.transaction('READ COMMITTED', async (tx) => {
        // Caller acquires flight/cabin locks in ascending UUID, then cabin order.
        for (const flightId of [FLIGHT, OTHER_FLIGHT]) {
          const result = await inventory.hold(tx, input({ bookingId, flightId }));
          if (!result.ok) {
            expect(result.error).toBe('SEATS_UNAVAILABLE');
            throw rejected;
          }
        }
      }),
    ).rejects.toBe(rejected);
    expect(
      await dataSource.query('SELECT * FROM "seat_holds" WHERE "bookingId" = $1', [bookingId]),
    ).toEqual([]);
    expect(await available()).toBe(10);
    expect(await available(OTHER_FLIGHT)).toBe(0);
  });

  it('US-INV-02-T14 AC-1 successful hold persists the requested booking, cabin, count and expiry without incrementing committed seats', async () => {
    const request = input({ cabin: 'BUSINESS', seats: 4, durationSeconds: 60 });
    const result = await hold(request);
    if (!result.ok) throw new Error(result.error);
    expect(
      await dataSource.query(
        'SELECT "bookingId", "flightId", "cabin", "seats", "status", "expiresAt" FROM "seat_holds" WHERE "id" = $1',
        [result.value],
      ),
    ).toEqual([
      {
        bookingId: request.bookingId,
        flightId: FLIGHT,
        cabin: 'BUSINESS',
        seats: 4,
        status: 'HELD',
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    ]);
    expect(await available()).toBe(10);
    expect(await available(FLIGHT, 'BUSINESS')).toBe(0);
    expect(
      await dataSource.query(
        'SELECT "committedSeats" FROM "cabin_inventory" WHERE "flightId" = $1 AND "cabin" = \'BUSINESS\'',
        [FLIGHT],
      ),
    ).toEqual([{ committedSeats: 0 }]);
  });

  it('US-INV-02-T15 AC-3 consumers normalize opposite trip orders before concurrent multi-flight locking', async () => {
    await setCapacity(1);
    await dataSource.query('UPDATE "cabin_inventory" SET "capacity" = 1 WHERE "flightId" = $1', [
      OTHER_FLIGHT,
    ]);
    const results = await reserveTogether(2, async (tx, attempt) => {
      const suppliedOrder = attempt === 0 ? [FLIGHT, OTHER_FLIGHT] : [OTHER_FLIGHT, FLIGHT];
      const ordered = suppliedOrder.sort(); // Normalized UUIDs; both requests use ECONOMY.
      const bookingId = randomUUID();
      const first = await inventory.hold(tx, input({ bookingId, flightId: ordered[0] }));
      if (!first.ok) return first;
      return inventory.hold(tx, input({ bookingId, flightId: ordered[1] }));
    });
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: 'SEATS_UNAVAILABLE' },
    ]);
    expect(
      await dataSource.query(
        'SELECT COUNT(*)::integer AS holds, COUNT(DISTINCT "bookingId")::integer AS bookings FROM "seat_holds"',
      ),
    ).toEqual([{ holds: 2, bookings: 1 }]);
    expect(await available()).toBe(0);
    expect(await available(OTHER_FLIGHT)).toBe(0);
  });

  it('US-INV-02-T16 AC-3/4 a waiter can reserve after the first reservation rolls back', async () => {
    await setCapacity(1);
    const [first, second] = await runners(2);
    let pending: Promise<Awaited<ReturnType<InventoryApi['hold']>>> | undefined;
    try {
      expect((await inventory.hold(first.runner.manager, input())).ok).toBe(true);
      pending = inventory.hold(second.runner.manager, input());
      await vi.waitFor(
        async () => {
          const [row] = await dataSource.query<{ blocked: boolean }[]>(
            'SELECT $1::integer = ANY(pg_blocking_pids($2)) AS blocked',
            [first.pid, second.pid],
          );
          expect(row.blocked).toBe(true);
        },
        { timeout: 5000, interval: 20 },
      );
      await first.runner.rollbackTransaction();
      expect((await pending).ok).toBe(true);
      await second.runner.commitTransaction();
      expect(await activeSeats()).toEqual({ holds: 1, seats: 1 });
      expect(await dataSource.query('SELECT COUNT(*)::integer AS holds FROM "seat_holds"')).toEqual(
        [{ holds: 1 }],
      );
    } finally {
      await closeRunner(first.runner);
      if (pending) await pending.catch(() => undefined);
      await closeRunner(second.runner);
    }
  });

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    'NFR-CONS-01 repetition %i: 50 simultaneous attempts for 10 seats yield exactly 10 successes and 40 conflicts',
    async (repetition) => {
      const started = performance.now();
      const results = await reserveTogether(50);
      expect(results.filter((result) => result.ok)).toHaveLength(10);
      expect(results.filter((result) => !result.ok)).toEqual(
        Array.from({ length: 40 }, () => ({ ok: false, error: 'SEATS_UNAVAILABLE' })),
      );
      expect(await activeSeats()).toEqual({ holds: 10, seats: 10 });
      expect(await available()).toBe(0);
      console.info(
        `NFR-CONS-01 run=${repetition} connections=50 success=10 conflicts=40 oversold=0 errors=0 elapsedMs=${Math.round(performance.now() - started)}`,
      );
    },
  );
});
