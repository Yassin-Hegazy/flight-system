import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type QueryRunner } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDatabaseOptions } from '../src/database/database.options';
import {
  INVENTORY_API,
  InventoryModule,
  type InventoryApi,
  type ReleaseOptions,
} from '../src/modules/inventory/index';
import { CLOCK } from '../src/shared/time';
import { startTestDatabase, type TestDatabase } from './support/postgres';

@Injectable()
class Consumer {
  constructor(@Inject(INVENTORY_API) readonly inventory: InventoryApi) {}
}
@Module({ imports: [InventoryModule], providers: [Consumer] })
class ConsumerModule {}
const FLIGHT = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-11-12T12:00:00Z');

describe('US-INV-04 release against PostgreSQL', () => {
  let database: TestDatabase;
  let moduleRef: TestingModule;
  let db: DataSource;
  let api: InventoryApi;
  let now: Date;
  beforeAll(async () => {
    database = await startTestDatabase();
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...baseDatabaseOptions(database.url), autoLoadEntities: true }),
        ConsumerModule,
      ],
    })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(now) })
      .compile();
    await moduleRef.init();
    db = moduleRef.get(DataSource);
    api = moduleRef.get(Consumer).inventory;
  });
  beforeEach(async () => {
    now = new Date(NOW);
    // This URL belongs exclusively to the new disposable Testcontainer, never .env/local data.
    await db.query('TRUNCATE seat_holds, cabin_inventory');
    await db.query('DELETE FROM flights');
    await db.query(
      `INSERT INTO flights (id, "flightNumber", "airlineCode", "originCode", "destinationCode",
      "scheduledDepartureUtc", "scheduledArrivalUtc", "departureLocalDate") VALUES
      ($1, 'MS951', 'MS', 'CAI', 'LHR', '2027-12-10T07:00Z', '2027-12-10T12:00Z', '2027-12-10'),
      ($2, 'MS952', 'MS', 'CAI', 'LHR', '2027-12-10T09:00Z', '2027-12-10T14:00Z', '2027-12-10')`,
      [FLIGHT, OTHER],
    );
    await db.query(
      `INSERT INTO cabin_inventory ("flightId", cabin, capacity, "committedSeats")
      VALUES ($1, 'ECONOMY', 10, 0), ($1, 'BUSINESS', 4, 0), ($2, 'ECONOMY', 10, 0)`,
      [FLIGHT, OTHER],
    );
  });
  afterAll(async () => {
    await moduleRef?.close();
    await database?.stop();
  });
  async function hold(paid = false, seats = 2) {
    const result = await db.transaction('READ COMMITTED', (tx) =>
      api.hold(tx, { bookingId: randomUUID(), flightId: FLIGHT, cabin: 'ECONOMY', seats }),
    );
    if (!result.ok) throw new Error(result.error);
    if (paid)
      expect(
        (await db.transaction('READ COMMITTED', (tx) => api.commit(tx, result.value))).ok,
      ).toBe(true);
    return result.value;
  }
  const release = (id: string, options?: ReleaseOptions) =>
    db.transaction('READ COMMITTED', (tx) => api.release(tx, id, options));
  async function load() {
    const result = await api.cabinLoad(FLIGHT);
    if (!result.ok) throw new Error(result.error);
    return result.value[0];
  }
  async function state(id: string) {
    const [row] = await db.query<{ status: string; committedSeats: number }[]>(
      `SELECT h.status, i."committedSeats" FROM seat_holds h JOIN cabin_inventory i
     ON h."flightId" = i."flightId" AND h.cabin = i.cabin WHERE h.id = $1`,
      [id],
    );
    return row;
  }
  async function runners() {
    const result = [db.createQueryRunner(), db.createQueryRunner()];
    for (const runner of result) {
      await runner.connect();
      await runner.startTransaction('READ COMMITTED');
      await runner.query("SET LOCAL lock_timeout = '5s'");
      await runner.query("SET LOCAL statement_timeout = '8s'");
    }
    const pids = await Promise.all(
      result.map(async (runner) => {
        const [row] = await runner.manager.query<{ pid: number }[]>(
          'SELECT pg_backend_pid() AS pid',
        );
        return row.pid;
      }),
    );
    expect(pids[0]).not.toBe(pids[1]);
    return { first: result[0], second: result[1], pids };
  }
  async function close(...items: QueryRunner[]) {
    for (const runner of items) {
      try {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
      } finally {
        if (!runner.isReleased) await runner.release();
      }
    }
  }
  async function blocked(pids: number[]) {
    await vi.waitFor(
      async () => {
        const [row] = await db.query<{ waiting: boolean }[]>(
          'SELECT $1::integer = ANY(pg_blocking_pids($2)) AS waiting',
          pids,
        );
        expect(row.waiting).toBe(true);
      },
      { timeout: 3000, interval: 20 },
    );
  }

  it.each(['traveler cancellation', 'hold expiry', 'airline cancellation'])(
    'US-INV-04-T01 AC-1 %s invokes the same release Facade',
    async (trigger) => {
      const id = await hold(trigger !== 'hold expiry');
      if (trigger === 'hold expiry') now = new Date(NOW.getTime() + 900_000);
      expect(
        await release(id, trigger === 'hold expiry' ? { expiredOnly: true } : undefined),
      ).toEqual({ ok: true, value: 'RELEASED' });
      expect(await state(id)).toEqual({ status: 'RELEASED', committedSeats: 0 });
      expect(await load()).toMatchObject({ activeHeldSeats: 0, availableSeats: 10 });
    },
  );
  it.each([false, true])(
    'US-INV-04-T02 AC-2 paid=%s duplicate release is a complete data no-op',
    async (paid) => {
      const id = await hold(paid);
      const [history] = await db.query<{ bookingId: string; expiresAt: Date; seats: number }[]>(
        'SELECT "bookingId", "expiresAt", seats FROM seat_holds WHERE id = $1',
        [id],
      );
      expect((await load()).availableSeats).toBe(8);
      expect(await release(id.toUpperCase())).toEqual({ ok: true, value: 'RELEASED' });
      const rows = await db.query('SELECT * FROM seat_holds');
      const counts = await db.query('SELECT * FROM cabin_inventory ORDER BY "flightId", cabin');
      expect(await release(id)).toEqual({ ok: true, value: 'ALREADY_RELEASED' });
      expect(await db.query('SELECT * FROM seat_holds')).toEqual(rows);
      expect(await db.query('SELECT * FROM cabin_inventory ORDER BY "flightId", cabin')).toEqual(
        counts,
      );
      expect(
        await db.query('SELECT "bookingId", "expiresAt", seats FROM seat_holds WHERE id = $1', [
          id,
        ]),
      ).toEqual([history]);
      expect(await load()).toMatchObject({
        committedSeats: 0,
        activeHeldSeats: 0,
        availableSeats: 10,
      });
    },
  );
  it.each(Array.from({ length: 10 }, (_, n) => ({ run: n + 1, paid: n % 2 === 0 })))(
    'US-INV-04-T03 AC-3 simultaneous releases run $run paid=$paid',
    async ({ paid }) => {
      const id = await hold(paid);
      const { first, second } = await runners();
      const gate = Promise.withResolvers<void>();
      const operations = [first, second].map(async (runner) => {
        await gate.promise;
        try {
          const result = await api.release(runner.manager, id);
          await runner.commitTransaction();
          return result;
        } finally {
          await close(runner);
        }
      });
      gate.resolve();
      const results = await Promise.allSettled(operations);
      expect(results.every((item) => item.status === 'fulfilled')).toBe(true);
      const outcomes = results.map((item) => (item.status === 'fulfilled' ? item.value : null));
      expect(outcomes).toEqual(
        expect.arrayContaining([
          { ok: true, value: 'RELEASED' },
          { ok: true, value: 'ALREADY_RELEASED' },
        ]),
      );
      expect(await state(id)).toEqual({ status: 'RELEASED', committedSeats: 0 });
      expect((await load()).availableSeats).toBe(10);
    },
  );
  it.each([
    ['bad', false],
    [randomUUID(), true],
  ])('US-INV-04-T04 malformed/unknown %s', async (id, valid) => {
    expect(await release(id)).toEqual(
      valid ? { ok: true, value: 'ALREADY_RELEASED' } : { ok: false, error: 'INVALID_HOLD_ID' },
    );
  });
  it('US-INV-04-T05 expired HELD cleanup does not increase already-free availability twice', async () => {
    const id = await hold();
    now = new Date(NOW.getTime() + 900_000);
    expect((await load()).availableSeats).toBe(10);
    expect(await release(id, { expiredOnly: true })).toEqual({ ok: true, value: 'RELEASED' });
    expect((await load()).availableSeats).toBe(10);
    expect(await release(id, { expiredOnly: true })).toEqual({
      ok: true,
      value: 'ALREADY_RELEASED',
    });
  });
  it.each([-1, 0, 1])('US-INV-04-T06 expiry-only boundary %i ms', async (offset) => {
    const id = await hold();
    now = new Date(NOW.getTime() + 900_000 + offset);
    expect(await release(id, { expiredOnly: true })).toEqual({
      ok: true,
      value: offset < 0 ? 'ALREADY_RELEASED' : 'RELEASED',
    });
    expect(await state(id)).toEqual({
      status: offset < 0 ? 'HELD' : 'RELEASED',
      committedSeats: 0,
    });
  });
  it('US-INV-04-T07 expiry-only rechecks a stale discovery candidate that has since been paid', async () => {
    const id = await hold();
    expect((await state(id)).status).toBe('HELD');
    expect((await db.transaction('READ COMMITTED', (tx) => api.commit(tx, id))).ok).toBe(true);
    now = new Date(NOW.getTime() + 901_000);
    expect(await release(id, { expiredOnly: true })).toEqual({
      ok: true,
      value: 'ALREADY_RELEASED',
    });
    expect(await state(id)).toEqual({ status: 'COMMITTED', committedSeats: 2 });
    expect((await load()).availableSeats).toBe(8);
    expect(await release(id)).toEqual({ ok: true, value: 'RELEASED' });
  });
  it('US-INV-04-T08 persisted EXPIRED can be explicitly released without decrement', async () => {
    const id = await hold();
    await db.query("UPDATE seat_holds SET status = 'EXPIRED' WHERE id = $1", [id]);
    expect(await release(id)).toEqual({ ok: true, value: 'RELEASED' });
    expect(await state(id)).toEqual({ status: 'RELEASED', committedSeats: 0 });
  });
  it('US-INV-04-T09 caller failure after release restores hold and committed count', async () => {
    const id = await hold(true);
    const failure = new Error('cancellation failed');
    await expect(
      db.transaction('READ COMMITTED', async (tx) => {
        expect(await api.release(tx, id)).toEqual({ ok: true, value: 'RELEASED' });
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await state(id)).toEqual({ status: 'COMMITTED', committedSeats: 2 });
    expect((await load()).availableSeats).toBe(8);
  });
  it('US-INV-04-T10 NFR-CONS-02 fault between decrement and status update rolls back both', async () => {
    const id = await hold(true);
    await db.query(
      `CREATE FUNCTION fail_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected release failure'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER fail_release BEFORE UPDATE OF status ON seat_holds FOR EACH ROW WHEN (NEW.status = 'RELEASED') EXECUTE FUNCTION fail_release()`,
    );
    try {
      await expect(release(id)).rejects.toThrow('injected release failure');
    } finally {
      await db.query('DROP TRIGGER fail_release ON seat_holds');
      await db.query('DROP FUNCTION fail_release()');
    }
    expect(await state(id)).toEqual({ status: 'COMMITTED', committedSeats: 2 });
  });
  it('US-INV-04-T11 database CHECK refuses an inconsistent decrement, never clamps committed seats', async () => {
    const id = await hold(true);
    await db.query('UPDATE cabin_inventory SET "committedSeats" = 0 WHERE "flightId" = $1', [
      FLIGHT,
    ]);
    await expect(release(id)).rejects.toMatchObject({
      driverError: { code: '23514', constraint: 'cabin_inventory_committed_valid' },
    });
    expect((await state(id)).status).toBe('COMMITTED');
  });
  it.each(['REPEATABLE READ', 'SERIALIZABLE'] as const)(
    'US-INV-04-T15 release refuses %s transaction snapshots',
    async (isolation) => {
      const id = await hold(true);
      await expect(db.transaction(isolation, (tx) => api.release(tx, id))).rejects.toThrow(
        'READ COMMITTED',
      );
      expect(await state(id)).toEqual({ status: 'COMMITTED', committedSeats: 2 });
    },
  );
  it('US-INV-04-T14 releasing one paid hold preserves another paid hold in the same cabin', async () => {
    const first = await hold(true, 2);
    const second = await hold(true, 3);
    expect(await release(first)).toEqual({ ok: true, value: 'RELEASED' });
    expect(await state(second)).toEqual({ status: 'COMMITTED', committedSeats: 3 });
    expect(await load()).toMatchObject({
      capacity: 10,
      committedSeats: 3,
      activeHeldSeats: 0,
      availableSeats: 7,
    });
    expect(await release(first)).toEqual({ ok: true, value: 'ALREADY_RELEASED' });
    expect((await load()).committedSeats).toBe(3);
  });
  it.each([1, 2, 3, 4, 5])(
    'US-INV-04-T16 AC-3 simultaneous expiry and cancellation run %i',
    async () => {
      const id = await hold();
      now = new Date(NOW.getTime() + 900_000);
      const { first, second } = await runners();
      const gate = Promise.withResolvers<void>();
      const operations = [first, second].map(async (runner, index) => {
        await gate.promise;
        try {
          const result = await api.release(
            runner.manager,
            id,
            index === 0 ? { expiredOnly: true } : undefined,
          );
          await runner.commitTransaction();
          return result;
        } finally {
          await close(runner);
        }
      });
      gate.resolve();
      const results = await Promise.allSettled(operations);
      expect(results.every((item) => item.status === 'fulfilled')).toBe(true);
      expect(results.map((item) => (item.status === 'fulfilled' ? item.value : null))).toEqual(
        expect.arrayContaining([
          { ok: true, value: 'RELEASED' },
          { ok: true, value: 'ALREADY_RELEASED' },
        ]),
      );
      expect(await state(id)).toEqual({ status: 'RELEASED', committedSeats: 0 });
      expect((await load()).availableSeats).toBe(10);
    },
  );
  it('US-INV-04-T12 all writes require a caller transaction even for missing holds', async () => {
    await expect(api.release(db.manager, randomUUID())).rejects.toThrow(
      'active caller transaction',
    );
  });

  /**
   * Two transactions contend for the same cabin lock. The first acts and keeps its transaction
   * open; the second must wait for it, and its result depends on how the first one ends.
   */
  type Step = (tx: EntityManager, id: string) => Promise<unknown>;
  interface Contention {
    name: string;
    /** The hold is already paid (COMMITTED) before the two transactions start. */
    paid?: boolean;
    /** The clock when the first transaction acts; the hold itself is always created at NOW. */
    startAt?: Date;
    first: Step;
    second: Step;
    /** The clock once the second transaction is waiting on the first one's lock. */
    whileBlockedAt?: Date;
    firstRollsBack?: boolean;
    check: (result: unknown) => void;
    finalHold: { status: string; committedSeats?: number };
  }
  const RELEASED = { ok: true, value: 'RELEASED' };
  const ALREADY_RELEASED = { ok: true, value: 'ALREADY_RELEASED' };
  const equals = (expected: unknown) => (result: unknown) => expect(result).toEqual(expected);
  const succeeds = (result: unknown) => expect(result).toMatchObject({ ok: true });
  const commitFirst: Step = async (tx, id) => expect((await api.commit(tx, id)).ok).toBe(true);
  const releaseFirst =
    (options?: ReleaseOptions): Step =>
    async (tx, id) =>
      expect(await api.release(tx, id, options)).toEqual(RELEASED);
  const releaseSecond =
    (options?: ReleaseOptions): Step =>
    (tx, id) =>
      api.release(tx, id, options);

  const CONTENTION: Contention[] = [
    {
      name: 'commit wins',
      first: commitFirst,
      second: releaseSecond(),
      check: equals(RELEASED),
      finalHold: { status: 'RELEASED' },
    },
    {
      name: 'release wins',
      first: releaseFirst(),
      second: (tx, id) => api.commit(tx, id),
      check: equals({ ok: false, error: 'NOT_HELD' }),
      finalHold: { status: 'RELEASED' },
    },
    {
      name: 'release rolls back',
      paid: true,
      first: releaseFirst(),
      second: releaseSecond(),
      firstRollsBack: true,
      check: equals(RELEASED),
      finalHold: { status: 'RELEASED' },
    },
    {
      name: 'expiry versus cancellation',
      startAt: new Date(NOW.getTime() + 900_000),
      first: releaseFirst({ expiredOnly: true }),
      second: releaseSecond(),
      check: equals(ALREADY_RELEASED),
      finalHold: { status: 'RELEASED' },
    },
    {
      name: 'hold after release',
      first: releaseFirst(),
      second: (tx) =>
        api.hold(tx, { bookingId: randomUUID(), flightId: FLIGHT, cabin: 'ECONOMY', seats: 10 }),
      check: succeeds,
      finalHold: { status: 'RELEASED' },
    },
    {
      name: 'capacity after release',
      paid: true,
      first: releaseFirst(),
      second: (tx) => api.setCapacity(tx, FLIGHT, 'ECONOMY', 0),
      check: succeeds,
      finalHold: { status: 'RELEASED' },
    },
    {
      name: 'release after capacity',
      paid: true,
      first: async (tx) => expect((await api.setCapacity(tx, FLIGHT, 'ECONOMY', 2)).ok).toBe(true),
      second: releaseSecond(),
      check: equals(RELEASED),
      finalHold: { status: 'RELEASED' },
    },
    {
      name: 'expiry candidate after commit',
      first: commitFirst,
      second: releaseSecond({ expiredOnly: true }),
      whileBlockedAt: new Date(NOW.getTime() + 901_000),
      check: equals(ALREADY_RELEASED),
      finalHold: { status: 'COMMITTED', committedSeats: 2 },
    },
  ];

  it.each(CONTENTION)('US-INV-04-T13 real lock contention: $name', async (scenario) => {
    const id = await hold(scenario.paid);
    now = scenario.startAt ?? now;
    const { first, second, pids } = await runners();
    let pending: Promise<unknown> | undefined;
    try {
      await scenario.first(first.manager, id);
      pending = scenario.second(second.manager, id);
      await blocked(pids);
      now = scenario.whileBlockedAt ?? now;
      await (scenario.firstRollsBack ? first.rollbackTransaction() : first.commitTransaction());
      scenario.check(await pending);
      await second.commitTransaction();
      const rows = await api.cabinLoad(FLIGHT);
      if (!rows.ok) throw new Error(rows.error);
      for (const row of rows.value)
        expect(row.capacity).toBe(row.committedSeats + row.activeHeldSeats + row.availableSeats);
      expect(await state(id)).toMatchObject(scenario.finalHold);
      expect(rows.value[1]).toMatchObject({
        capacity: 4,
        committedSeats: 0,
        activeHeldSeats: 0,
        availableSeats: 4,
      });
      expect(
        await db.query(
          'SELECT capacity, "committedSeats" FROM cabin_inventory WHERE "flightId" = $1',
          [OTHER],
        ),
      ).toEqual([{ capacity: 10, committedSeats: 0 }]);
    } finally {
      await close(first);
      if (pending) await pending.catch(() => undefined);
      await close(second);
    }
  });
});
