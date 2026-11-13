import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDatabaseOptions } from '../src/database/database.options';
import { INVENTORY_API, InventoryModule, type InventoryApi } from '../src/modules/inventory/index';
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

describe('Extended Inventory against PostgreSQL', () => {
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
    // Only this suite's disposable Testcontainers database is modified.
    await db.query('TRUNCATE "refunds", "payments", "bookings", "seat_holds", "cabin_inventory"');
    await db.query('DELETE FROM "flights"');
    await db.query(
      `INSERT INTO "flights" ("id", "flightNumber", "airlineCode", "originCode", "destinationCode",
      "scheduledDepartureUtc", "scheduledArrivalUtc", "departureLocalDate") VALUES
      ($1, 'MS941', 'MS', 'CAI', 'LHR', '2027-12-10T07:00Z', '2027-12-10T12:00Z', '2027-12-10'),
      ($2, 'MS942', 'MS', 'CAI', 'LHR', '2027-12-10T09:00Z', '2027-12-10T14:00Z', '2027-12-10')`,
      [FLIGHT, OTHER],
    );
    await db.query(
      `INSERT INTO "cabin_inventory" ("flightId", "cabin", "capacity", "committedSeats")
      VALUES ($1, 'ECONOMY', 10, 0), ($1, 'BUSINESS', 4, 0)`,
      [FLIGHT],
    );
  });
  afterAll(async () => {
    await moduleRef?.close();
    await database?.stop();
  });

  async function makeHold(seats = 2, durationSeconds = 900) {
    const result = await db.transaction('READ COMMITTED', (tx) =>
      api.hold(tx, {
        bookingId: randomUUID(),
        flightId: FLIGHT,
        cabin: 'ECONOMY',
        seats,
        durationSeconds,
      }),
    );
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  const commit = (id: string) => db.transaction('READ COMMITTED', (tx) => api.commit(tx, id));
  const capacity = (n: number, flightId = FLIGHT) =>
    db.transaction('READ COMMITTED', (tx) => api.setCapacity(tx, flightId, 'ECONOMY', n));
  async function available() {
    const result = await api.checkAvailability([
      { flightId: FLIGHT, cabin: 'ECONOMY', passengers: { adults: 1 } },
    ]);
    if (!result.ok) throw new Error(result.error);
    return result.value[0].availableSeats;
  }
  async function state(id: string) {
    const [row] = await db.query<{ status: string; committedSeats: number }[]>(
      `SELECT h.status, i."committedSeats" FROM seat_holds h JOIN cabin_inventory i
       ON i."flightId" = h."flightId" AND i.cabin = h.cabin WHERE h.id = $1`,
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
      { interval: 20, timeout: 3000 },
    );
  }

  describe('FBS-23 prepayment validation', () => {
    async function held() {
      const id = await makeHold();
      const [row] = await db.query<{ bookingId: string; expiresAt: Date }[]>(
        'SELECT "bookingId", "expiresAt" FROM seat_holds WHERE id = $1',
        [id],
      );
      return { id, ...row };
    }
    it('US-INV-03-P01 valid booking-bound hold returns its original expiration', async () => {
      const hold = await held();
      expect(
        await api.validateForPayment(hold.id.toUpperCase(), hold.bookingId.toUpperCase()),
      ).toEqual({
        ok: true,
        value: { holdId: hold.id, bookingId: hold.bookingId, expiresAt: hold.expiresAt },
      });
    });
    it.each([
      [-1, true],
      [0, false],
      [1, false],
    ])('US-INV-03-P02 expiry boundary %i ms', async (offset, valid) => {
      const hold = await held();
      now = new Date(hold.expiresAt.getTime() + offset);
      const result = await api.validateForPayment(hold.id, hold.bookingId);
      expect(result.ok).toBe(valid);
      if (!valid) expect(result).toEqual({ ok: false, error: 'HOLD_EXPIRED' });
    });
    it('US-INV-03-P03 unknown hold returns NOT_HELD', async () => {
      expect(await api.validateForPayment(randomUUID(), randomUUID())).toEqual({
        ok: false,
        error: 'NOT_HELD',
      });
    });
    it.each([
      ['bad', randomUUID(), 'INVALID_HOLD_ID'],
      [randomUUID(), 'bad', 'INVALID_BOOKING_ID'],
    ])('US-INV-03-P04 malformed input %s / %s (%s)', async (id, bookingId, error) => {
      expect(await api.validateForPayment(id, bookingId)).toEqual({ ok: false, error });
    });
    it.each(['COMMITTED', 'RELEASED', 'EXPIRED'])(
      'US-INV-03-P05 terminal state %s agrees with commitment',
      async (status) => {
        const hold = await held();
        if (status === 'COMMITTED') expect((await commit(hold.id)).ok).toBe(true);
        else await db.query('UPDATE seat_holds SET status = $1 WHERE id = $2', [status, hold.id]);
        const error = status === 'EXPIRED' ? 'HOLD_EXPIRED' : 'NOT_HELD';
        expect(await api.validateForPayment(hold.id, hold.bookingId)).toEqual({ ok: false, error });
        expect(await commit(hold.id)).toEqual({ ok: false, error });
      },
    );
    it('US-INV-03-P06 a different booking cannot use the hold, even after expiry', async () => {
      const hold = await held();
      const otherBooking = randomUUID();
      expect(await api.validateForPayment(hold.id, otherBooking)).toEqual({
        ok: false,
        error: 'NOT_HELD',
      });
      now = new Date(hold.expiresAt);
      expect(await api.validateForPayment(hold.id, otherBooking)).toEqual({
        ok: false,
        error: 'NOT_HELD',
      });
    });
    it('US-INV-03-P07 repeated checks perform only a SELECT and never change or renew any database state', async () => {
      const hold = await held();
      const holdsBefore = await db.query('SELECT * FROM seat_holds');
      const inventoryBefore = await db.query('SELECT * FROM cabin_inventory ORDER BY cabin');
      for (const offset of [0, 60_000, 899_999]) {
        now = new Date(NOW.getTime() + offset);
        const query = vi.spyOn(db.manager, 'query');
        try {
          expect(await api.validateForPayment(hold.id, hold.bookingId)).toEqual({
            ok: true,
            value: { holdId: hold.id, bookingId: hold.bookingId, expiresAt: hold.expiresAt },
          });
          expect(query).toHaveBeenCalledTimes(1);
          const sql = query.mock.calls[0][0];
          expect(sql.trim()).toMatch(/^SELECT /i);
          expect(sql).not.toMatch(/FOR UPDATE|FOR SHARE|LOCK TABLE/i);
        } finally {
          query.mockRestore();
        }
      }
      expect(await db.query('SELECT * FROM seat_holds')).toEqual(holdsBefore);
      expect(await db.query('SELECT * FROM cabin_inventory ORDER BY cabin')).toEqual(
        inventoryBefore,
      );
    });
    it('US-INV-03-P08 eligible validation can be followed by successful commitment', async () => {
      const hold = await held();
      expect((await api.validateForPayment(hold.id, hold.bookingId)).ok).toBe(true);
      expect(await commit(hold.id)).toEqual({ ok: true, value: undefined });
      expect(await state(hold.id)).toEqual({ status: 'COMMITTED', committedSeats: 2 });
      expect(await available()).toBe(8);
    });
    it('US-INV-03-P09 eligibility never guarantees later commitment or renews the original expiry', async () => {
      const hold = await held();
      expect((await api.validateForPayment(hold.id, hold.bookingId)).ok).toBe(true);
      now = new Date(hold.expiresAt.getTime() + 1);
      expect(await commit(hold.id)).toEqual({ ok: false, error: 'HOLD_EXPIRED' });
      expect(await api.validateForPayment(hold.id, hold.bookingId)).toEqual({
        ok: false,
        error: 'HOLD_EXPIRED',
      });
      expect(await state(hold.id)).toEqual({ status: 'HELD', committedSeats: 0 });
      expect(await db.query('SELECT "expiresAt" FROM seat_holds WHERE id = $1', [hold.id])).toEqual(
        [{ expiresAt: hold.expiresAt }],
      );
    });
    it('US-INV-03-P10 only committed persisted holds are visible to the read-only prepayment check', async () => {
      const bookingId = randomUUID();
      const { first, second } = await runners();
      try {
        const result = await api.hold(first.manager, {
          bookingId,
          flightId: FLIGHT,
          cabin: 'ECONOMY',
          seats: 1,
        });
        if (!result.ok) throw new Error(result.error);
        expect(await api.validateForPayment(result.value, bookingId)).toEqual({
          ok: false,
          error: 'NOT_HELD',
        });
        await first.commitTransaction();
        expect((await api.validateForPayment(result.value, bookingId)).ok).toBe(true);
      } finally {
        await close(first, second);
      }
    });
  });

  describe('FBS-23 / US-INV-03', () => {
    it('US-INV-03-T01 AC-1 default hold is HELD for the booking until exactly now plus fifteen minutes', async () => {
      const bookingId = randomUUID();
      const result = await db.transaction('READ COMMITTED', (tx) =>
        api.hold(tx, { bookingId, flightId: FLIGHT, cabin: 'ECONOMY', seats: 2 }),
      );
      if (!result.ok) throw new Error(result.error);
      expect(
        await db.query('SELECT "bookingId", status, "expiresAt" FROM seat_holds WHERE id = $1', [
          result.value,
        ]),
      ).toEqual([{ bookingId, status: 'HELD', expiresAt: new Date(NOW.getTime() + 900_000) }]);
    });
    it('US-INV-03-T02 AC-2 the held final seat remains unavailable to competitors', async () => {
      await db.query(
        'UPDATE cabin_inventory SET capacity = 1 WHERE "flightId" = $1 AND cabin = \'ECONOMY\'',
        [FLIGHT],
      );
      await makeHold(1);
      expect(await available()).toBe(0);
      const result = await db.transaction('READ COMMITTED', (tx) =>
        api.hold(tx, { bookingId: randomUUID(), flightId: FLIGHT, cabin: 'ECONOMY', seats: 1 }),
      );
      expect(result).toEqual({ ok: false, error: 'SEATS_UNAVAILABLE' });
    });
    it('US-INV-03-T03 AC-3 caller failure between Inventory commit and booking confirmation rolls back both seat changes', async () => {
      const id = await makeHold();
      const failure = new Error('booking confirmation failed');
      await expect(
        db.transaction('READ COMMITTED', async (tx) => {
          expect(await api.commit(tx, id)).toEqual({ ok: true, value: undefined });
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(await state(id)).toEqual({ status: 'HELD', committedSeats: 0 });
      expect(await available()).toBe(8);
    });
    it('US-INV-03-T04 AC-4 expiration during a simulated payment rejects the late commitment', async () => {
      const id = await makeHold();
      const payment = Promise.withResolvers<void>();
      const confirmation = payment.promise.then(() => commit(id));
      now = new Date(NOW.getTime() + 900_000);
      payment.resolve();
      expect(await confirmation).toEqual({ ok: false, error: 'HOLD_EXPIRED' });
      expect(await state(id)).toEqual({ status: 'HELD', committedSeats: 0 });
      expect(await available()).toBe(10);
    });
    it.each([
      [-1, true],
      [0, false],
      [1, false],
    ])('US-INV-03-T05 AC-3/4 expiry boundary offset %i ms', async (offset, succeeds) => {
      const id = await makeHold();
      now = new Date(NOW.getTime() + 900_000 + offset);
      expect(await commit(id)).toEqual(
        succeeds ? { ok: true, value: undefined } : { ok: false, error: 'HOLD_EXPIRED' },
      );
      expect(await state(id)).toEqual({
        status: succeeds ? 'COMMITTED' : 'HELD',
        committedSeats: succeeds ? 2 : 0,
      });
    });
    it('US-INV-03-T06 AC-3 commits once and never double-counts even after expiry', async () => {
      const id = await makeHold();
      expect(await commit(id)).toEqual({ ok: true, value: undefined });
      expect(await available()).toBe(8);
      expect(await commit(id)).toEqual({ ok: false, error: 'NOT_HELD' });
      now = new Date(NOW.getTime() + 901_000);
      expect(await commit(id)).toEqual({ ok: false, error: 'NOT_HELD' });
      expect(await state(id)).toEqual({ status: 'COMMITTED', committedSeats: 2 });
    });
    it.each(['RELEASED', 'EXPIRED'])(
      'US-INV-03-T07 terminal state %s has a predictable outcome',
      async (status) => {
        const id = await makeHold();
        await db.query('UPDATE seat_holds SET status = $1 WHERE id = $2', [status, id]);
        expect(await commit(id)).toEqual({
          ok: false,
          error: status === 'EXPIRED' ? 'HOLD_EXPIRED' : 'NOT_HELD',
        });
      },
    );
    it.each([
      ['bad', 'INVALID_HOLD_ID'],
      [randomUUID(), 'NOT_HELD'],
    ])('US-INV-03-T08 rejects identifier %s (%s)', async (id, error) => {
      expect(await commit(id)).toEqual({ ok: false, error });
    });
    it('US-INV-03-T09 concurrent duplicate commits serialize and increment exactly once', async () => {
      const id = await makeHold();
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['commit']> | undefined;
      try {
        expect((await api.commit(first.manager, id)).ok).toBe(true);
        pending = api.commit(second.manager, id);
        await blocked(pids);
        await first.commitTransaction();
        expect(await pending).toEqual({ ok: false, error: 'NOT_HELD' });
        await second.commitTransaction();
        expect(await state(id)).toEqual({ status: 'COMMITTED', committedSeats: 2 });
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('US-INV-03-T10 expiry while waiting for a cabin lock is checked after the wait', async () => {
      const id = await makeHold();
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['commit']> | undefined;
      try {
        await first.query(
          'SELECT * FROM cabin_inventory WHERE "flightId" = $1 AND cabin = \'ECONOMY\' FOR UPDATE',
          [FLIGHT],
        );
        pending = api.commit(second.manager, id);
        await blocked(pids);
        now = new Date(NOW.getTime() + 900_000);
        await first.commitTransaction();
        expect(await pending).toEqual({ ok: false, error: 'HOLD_EXPIRED' });
        await second.commitTransaction();
        expect(await state(id)).toEqual({ status: 'HELD', committedSeats: 0 });
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('US-INV-03-T11 commit and hold use the same cabin-first lock order without deadlock', async () => {
      const id = await makeHold(10);
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['hold']> | undefined;
      try {
        expect((await api.commit(first.manager, id)).ok).toBe(true);
        pending = api.hold(second.manager, {
          bookingId: randomUUID(),
          flightId: FLIGHT,
          cabin: 'ECONOMY',
          seats: 1,
        });
        await blocked(pids);
        await first.commitTransaction();
        expect(await pending).toEqual({ ok: false, error: 'SEATS_UNAVAILABLE' });
        await second.commitTransaction();
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('US-INV-03-T12 a database failure inside commitment cannot leave a partial transition', async () => {
      const id = await makeHold();
      await db.query(`CREATE FUNCTION fail_inventory_commit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected status failure'; END $$`);
      await db.query(`CREATE TRIGGER fail_inventory_commit BEFORE UPDATE OF status ON seat_holds
        FOR EACH ROW WHEN (NEW.status = 'COMMITTED') EXECUTE FUNCTION fail_inventory_commit()`);
      try {
        await expect(commit(id)).rejects.toThrow('injected status failure');
      } finally {
        await db.query('DROP TRIGGER fail_inventory_commit ON seat_holds');
        await db.query('DROP FUNCTION fail_inventory_commit()');
      }
      expect(await state(id)).toEqual({ status: 'HELD', committedSeats: 0 });
    });
    it('US-INV-03-T13 an active caller transaction is required, including for missing holds', async () => {
      await expect(api.commit(db.manager, randomUUID())).rejects.toThrow(
        'active caller transaction',
      );
    });
  });

  describe('Additional FBS-23 lock regressions', () => {
    it('US-INV-03-T14 expiry is rechecked after waiting on the hold row itself', async () => {
      const id = await makeHold();
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['commit']> | undefined;
      try {
        // Isolate the second lock's wait; production writers must always lock cabin first.
        await first.query('SELECT * FROM seat_holds WHERE id = $1 FOR UPDATE', [id]);
        pending = api.commit(second.manager, id);
        await blocked(pids);
        now = new Date(NOW.getTime() + 900_000);
        await first.commitTransaction();
        expect(await pending).toEqual({ ok: false, error: 'HOLD_EXPIRED' });
        await second.commitTransaction();
        expect(await state(id)).toEqual({ status: 'HELD', committedSeats: 0 });
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('US-INV-03-T15 a waiting commit succeeds when the first commitment rolls back', async () => {
      const id = await makeHold();
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['commit']> | undefined;
      try {
        expect((await api.commit(first.manager, id)).ok).toBe(true);
        pending = api.commit(second.manager, id);
        await blocked(pids);
        await first.rollbackTransaction();
        expect((await pending).ok).toBe(true);
        await second.commitTransaction();
        expect(await state(id)).toEqual({ status: 'COMMITTED', committedSeats: 2 });
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('US-INV-03-T16 the database CHECK protects commitment even from invalid direct fixtures', async () => {
      const id = await makeHold();
      await db.query('UPDATE seat_holds SET seats = 11 WHERE id = $1', [id]);
      await expect(commit(id)).rejects.toMatchObject({
        driverError: { code: '23514', constraint: 'cabin_inventory_committed_valid' },
      });
      expect(await state(id)).toEqual({ status: 'HELD', committedSeats: 0 });
    });
  });

  describe('Additional Inventory setCapacity', () => {
    it('INV-CAP-T01 provisions an unconfigured cabin for a valid flight and supports zero/increase/decrease', async () => {
      expect(await capacity(0, OTHER)).toEqual({ ok: true, value: undefined });
      expect(await capacity(10, OTHER)).toEqual({ ok: true, value: undefined });
      expect(await capacity(3, OTHER)).toEqual({ ok: true, value: undefined });
      expect(
        await db.query(
          'SELECT capacity, "committedSeats" FROM cabin_inventory WHERE "flightId" = $1',
          [OTHER],
        ),
      ).toEqual([{ capacity: 3, committedSeats: 0 }]);
      expect(await api.cabinLoad(OTHER)).toEqual({
        ok: true,
        value: [
          {
            flightId: OTHER,
            cabin: 'ECONOMY',
            capacity: 3,
            committedSeats: 0,
            activeHeldSeats: 0,
            availableSeats: 3,
          },
        ],
      });
    });
    it('INV-CAP-T02 preserves committed and held seats, accepts their exact sum and returns structured BELOW_SOLD', async () => {
      const id = await makeHold(2);
      await commit(id);
      await makeHold(3);
      expect(await capacity(5)).toEqual({ ok: true, value: undefined });
      expect(await capacity(4)).toEqual({
        ok: false,
        error: { code: 'BELOW_SOLD', committedSeats: 2, activeHeldSeats: 3 },
      });
      expect(await capacity(6)).toEqual({ ok: true, value: undefined });
      expect(await available()).toBe(1);
    });
    it('INV-CAP-T03 expired holds do not block reducing capacity to zero', async () => {
      await makeHold(10);
      now = new Date(NOW.getTime() + 900_000);
      expect(await capacity(0)).toEqual({ ok: true, value: undefined });
      expect(await available()).toBe(0);
    });
    it.each([-1, 0.5, NaN, Infinity, 2_147_483_648])(
      'INV-CAP-T04 invalid capacity %s is rejected',
      async (n) => {
        expect(await capacity(n)).toEqual({ ok: false, error: 'INVALID_CAPACITY' });
        expect(await available()).toBe(10);
      },
    );
    it('INV-CAP-T05 missing flights return FLIGHT_NOT_FOUND without aborting the caller transaction', async () => {
      await db.transaction('READ COMMITTED', async (tx) => {
        expect(await api.setCapacity(tx, randomUUID(), 'ECONOMY', 5)).toEqual({
          ok: false,
          error: 'FLIGHT_NOT_FOUND',
        });
        expect(await api.setCapacity(tx, OTHER, 'ECONOMY', 5)).toEqual({
          ok: true,
          value: undefined,
        });
      });
    });
    it('INV-CAP-T06 simultaneous first provisioning is serialized by the primary key', async () => {
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['setCapacity']> | undefined;
      try {
        expect((await api.setCapacity(first.manager, OTHER, 'ECONOMY', 3)).ok).toBe(true);
        pending = api.setCapacity(second.manager, OTHER, 'ECONOMY', 5);
        await blocked(pids);
        await first.commitTransaction();
        expect((await pending).ok).toBe(true);
        await second.commitTransaction();
        expect(
          await db.query('SELECT capacity FROM cabin_inventory WHERE "flightId" = $1', [OTHER]),
        ).toEqual([{ capacity: 5 }]);
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('INV-CAP-T07 a capacity reduction waiting on a hold rechecks active seats', async () => {
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['setCapacity']> | undefined;
      try {
        expect(
          (
            await api.hold(first.manager, {
              bookingId: randomUUID(),
              flightId: FLIGHT,
              cabin: 'ECONOMY',
              seats: 8,
            })
          ).ok,
        ).toBe(true);
        pending = api.setCapacity(second.manager, FLIGHT, 'ECONOMY', 7);
        await blocked(pids);
        await first.commitTransaction();
        expect(await pending).toEqual({
          ok: false,
          error: { code: 'BELOW_SOLD', committedSeats: 0, activeHeldSeats: 8 },
        });
        await second.commitTransaction();
        expect(await available()).toBe(2);
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('INV-CAP-T08 a hold waiting on a capacity reduction uses the new capacity', async () => {
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['hold']> | undefined;
      try {
        expect((await api.setCapacity(first.manager, FLIGHT, 'ECONOMY', 1)).ok).toBe(true);
        pending = api.hold(second.manager, {
          bookingId: randomUUID(),
          flightId: FLIGHT,
          cabin: 'ECONOMY',
          seats: 2,
        });
        await blocked(pids);
        await first.commitTransaction();
        expect(await pending).toEqual({ ok: false, error: 'SEATS_UNAVAILABLE' });
        await second.commitTransaction();
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('INV-CAP-T09 rollback removes new provisioning and restores updates', async () => {
      const failure = new Error('admin failed');
      await expect(
        db.transaction('READ COMMITTED', async (tx) => {
          expect((await api.setCapacity(tx, OTHER, 'ECONOMY', 5)).ok).toBe(true);
          expect((await api.setCapacity(tx, FLIGHT, 'ECONOMY', 3)).ok).toBe(true);
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(await available()).toBe(10);
      expect(
        await db.query('SELECT * FROM cabin_inventory WHERE "flightId" = $1', [OTHER]),
      ).toEqual([]);
    });
  });

  describe('Additional capacity concurrency regressions', () => {
    it('INV-CAP-T10 competing reductions sample active holds after the wait', async () => {
      await makeHold(3);
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['setCapacity']> | undefined;
      try {
        expect((await api.setCapacity(first.manager, FLIGHT, 'ECONOMY', 6)).ok).toBe(true);
        pending = api.setCapacity(second.manager, FLIGHT, 'ECONOMY', 2);
        await blocked(pids);
        now = new Date(NOW.getTime() + 900_000);
        await first.commitTransaction();
        expect((await pending).ok).toBe(true);
        await second.commitTransaction();
        expect(await available()).toBe(2);
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('INV-CAP-T11 reducing capacity cannot race past conversion of held to committed seats', async () => {
      const id = await makeHold();
      const { first, second, pids } = await runners();
      let pending: ReturnType<InventoryApi['setCapacity']> | undefined;
      try {
        expect((await api.commit(first.manager, id)).ok).toBe(true);
        pending = api.setCapacity(second.manager, FLIGHT, 'ECONOMY', 1);
        await blocked(pids);
        await first.commitTransaction();
        expect(await pending).toEqual({
          ok: false,
          error: { code: 'BELOW_SOLD', committedSeats: 2, activeHeldSeats: 0 },
        });
        await second.commitTransaction();
        expect(await available()).toBe(8);
      } finally {
        await close(first);
        if (pending) await pending.catch(() => undefined);
        await close(second);
      }
    });
    it('INV-CAP-T12 provisions against a new flight in the same caller transaction', async () => {
      const flightId = randomUUID();
      const failure = new Error('flight creation rolled back');
      await expect(
        db.transaction('READ COMMITTED', async (tx) => {
          await tx.query(
            `INSERT INTO flights (id, "flightNumber", "airlineCode", "originCode", "destinationCode",
          "scheduledDepartureUtc", "scheduledArrivalUtc", "departureLocalDate")
          SELECT $1, 'MS943', "airlineCode", "originCode", "destinationCode", "scheduledDepartureUtc", "scheduledArrivalUtc", "departureLocalDate"
          FROM flights WHERE id = $2`,
            [flightId, FLIGHT],
          );
          expect((await api.setCapacity(tx, flightId, 'ECONOMY', 5)).ok).toBe(true);
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(
        await db.query('SELECT * FROM cabin_inventory WHERE "flightId" = $1', [flightId]),
      ).toEqual([]);
      expect(await db.query('SELECT id FROM flights WHERE id = $1', [flightId])).toEqual([]);
    });
    it('INV-CAP-T13 PostgreSQL integer maximum is accepted', async () => {
      expect((await capacity(2_147_483_647)).ok).toBe(true);
      expect(await available()).toBe(2_147_483_647);
    });
    it.each(['REPEATABLE READ', 'SERIALIZABLE'] as const)(
      'INV-CAP-T14 both new writers reject %s isolation',
      async (isolation) => {
        const id = await makeHold();
        await expect(db.transaction(isolation, (tx) => api.commit(tx, id))).rejects.toThrow(
          'READ COMMITTED',
        );
        await expect(
          db.transaction(isolation, (tx) => api.setCapacity(tx, FLIGHT, 'ECONOMY', 5)),
        ).rejects.toThrow('READ COMMITTED');
        expect(await state(id)).toEqual({ status: 'HELD', committedSeats: 0 });
        await expect(api.setCapacity(db.manager, FLIGHT, 'ECONOMY', 5)).rejects.toThrow(
          'active caller transaction',
        );
      },
    );
  });

  describe('Additional Inventory cabinLoad', () => {
    it('INV-LOAD-T01 reports both cabins from one statement with no committed-hold double counting', async () => {
      const id = await makeHold(2);
      await commit(id);
      await makeHold(3);
      const query = vi.spyOn(db.manager, 'query');
      try {
        expect(await api.cabinLoad(FLIGHT)).toEqual({
          ok: true,
          value: [
            {
              flightId: FLIGHT,
              cabin: 'ECONOMY',
              capacity: 10,
              committedSeats: 2,
              activeHeldSeats: 3,
              availableSeats: 5,
            },
            {
              flightId: FLIGHT,
              cabin: 'BUSINESS',
              capacity: 4,
              committedSeats: 0,
              activeHeldSeats: 0,
              availableSeats: 4,
            },
          ],
        });
        expect(query).toHaveBeenCalledTimes(1);
      } finally {
        query.mockRestore();
      }
    });
    it('INV-LOAD-T02 returns an empty list for missing flights or unprovisioned inventory', async () => {
      expect(await api.cabinLoad(OTHER)).toEqual({ ok: true, value: [] });
      expect(await api.cabinLoad(randomUUID())).toEqual({ ok: true, value: [] });
      expect(await api.cabinLoad('bad')).toEqual({ ok: false, error: 'INVALID_FLIGHT_ID' });
    });
    it('INV-LOAD-T03 expired holds disappear at the exact boundary and full cabins have zero available', async () => {
      await makeHold(10);
      const before = await api.cabinLoad(FLIGHT);
      expect(before).toMatchObject({
        ok: true,
        value: [{ activeHeldSeats: 10, availableSeats: 0 }, {}],
      });
      now = new Date(NOW.getTime() + 900_000);
      expect(await api.cabinLoad(FLIGHT)).toMatchObject({
        ok: true,
        value: [{ activeHeldSeats: 0, availableSeats: 10 }, {}],
      });
    });
    it('INV-LOAD-T04 generated valid states obey capacity = committed + active held + available', async () => {
      for (let n = 0; n < 24; n++) {
        await db.query('DELETE FROM seat_holds');
        const committed = n % 5;
        const held = (n * 7) % 6;
        const total = committed + held + (n % 3);
        await db.query(
          'UPDATE cabin_inventory SET capacity = $1, "committedSeats" = $2 WHERE "flightId" = $3 AND cabin = \'ECONOMY\'',
          [total, committed, FLIGHT],
        );
        if (held > 0) await makeHold(held);
        const result = await api.cabinLoad(FLIGHT);
        if (!result.ok) throw new Error(result.error);
        for (const row of result.value)
          expect(row.capacity).toBe(row.committedSeats + row.activeHeldSeats + row.availableSeats);
      }
    });
    it('INV-LOAD-T05 concurrent commit snapshots never report a partial hold/count transition', async () => {
      const id = await makeHold(2);
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction('READ COMMITTED');
      try {
        expect((await api.commit(runner.manager, id)).ok).toBe(true);
        expect(await api.cabinLoad(FLIGHT)).toMatchObject({
          ok: true,
          value: [{ committedSeats: 0, activeHeldSeats: 2, availableSeats: 8 }, {}],
        });
        await runner.commitTransaction();
        expect(await api.cabinLoad(FLIGHT)).toMatchObject({
          ok: true,
          value: [{ committedSeats: 2, activeHeldSeats: 0, availableSeats: 8 }, {}],
        });
      } finally {
        await close(runner);
      }
    });
  });
});
