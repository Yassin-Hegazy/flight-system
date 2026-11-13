import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import type { Tx } from '../../shared/db';
import type { Cabin } from '../flight-catalog/index';
import type {
  InventoryRepository,
  InventorySnapshot,
  NewSeatHold,
  StoredSeatHold,
} from './inventory.repository';
import type { CabinLoad } from './inventory-api';

@Injectable()
export class PgInventoryRepository implements InventoryRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async assertTransaction(tx: Tx): Promise<void> {
    const runner = tx?.queryRunner;
    if (!runner || runner.isReleased || !runner.isTransactionActive) {
      throw new Error('Inventory writes require an active caller transaction');
    }
    // At REPEATABLE READ a waiter could still see an old holds snapshot after obtaining the
    // lock, because inserting a hold does not update the inventory row. Enforce the contract.
    const [settings] = await tx.query<{ transaction_isolation: string }[]>(
      'SHOW transaction_isolation',
    );
    if (settings.transaction_isolation !== 'read committed') {
      throw new Error('Inventory writes require READ COMMITTED isolation');
    }
  }

  async lockCabin(tx: Tx, flightId: string, cabin: Cabin): Promise<boolean> {
    await this.assertTransaction(tx);
    const rows = await tx.query<{ flightId: string }[]>(
      `SELECT "flightId" FROM "cabin_inventory"
       WHERE "flightId" = $1 AND "cabin" = $2 FOR UPDATE`,
      [flightId, cabin],
    );
    return rows.length !== 0;
  }

  async findHold(tx: Tx, id: string): Promise<StoredSeatHold | null> {
    const [hold] = await tx.query<StoredSeatHold[]>('SELECT * FROM "seat_holds" WHERE "id" = $1', [
      id,
    ]);
    return hold ?? null;
  }

  async lockHold(tx: Tx, id: string): Promise<StoredSeatHold | null> {
    const [hold] = await tx.query<StoredSeatHold[]>(
      'SELECT * FROM "seat_holds" WHERE "id" = $1 FOR UPDATE',
      [id],
    );
    return hold ?? null;
  }

  async findPaymentHold(
    id: string,
    bookingId: string,
    tx = this.dataSource.manager,
  ): Promise<StoredSeatHold | null> {
    const [hold] = await tx.query<StoredSeatHold[]>(
      'SELECT * FROM "seat_holds" WHERE "id" = $1 AND "bookingId" = $2',
      [id, bookingId],
    );
    return hold ?? null;
  }

  async commitHeld(tx: Tx, hold: StoredSeatHold): Promise<void> {
    await tx.query(
      `UPDATE "cabin_inventory" SET "committedSeats" = "committedSeats" + $3
      WHERE "flightId" = $1 AND "cabin" = $2`,
      [hold.flightId, hold.cabin, hold.seats],
    );
    // TypeORM's PostgreSQL UPDATE result is [returnedRows, affectedCount], unlike INSERT.
    const [, affected] = await tx.query<[{ id: string }[], number]>(
      `UPDATE "seat_holds" SET "status" = 'COMMITTED' WHERE "id" = $1 AND "status" = 'HELD' RETURNING "id"`,
      [hold.id],
    );
    if (affected !== 1) throw new Error('Locked hold changed during commitment');
  }

  async ensureCabin(tx: Tx, flightId: string, cabin: Cabin): Promise<boolean> {
    await this.assertTransaction(tx);
    // The PK serializes simultaneous provisioning. A savepoint recovers ONLY the expected FK
    // error without aborting the caller's transaction; it never starts an independent one.
    await tx.query('SAVEPOINT inventory_capacity_provision');
    try {
      await tx.query(
        `INSERT INTO "cabin_inventory" ("flightId", "cabin", "capacity", "committedSeats")
        VALUES ($1, $2, 0, 0) ON CONFLICT ("flightId", "cabin") DO NOTHING`,
        [flightId, cabin],
      );
      await tx.query('RELEASE SAVEPOINT inventory_capacity_provision');
      return true;
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const cause = error.driverError as { code?: string; constraint?: string };
        if (cause.code === '23503' && cause.constraint === 'cabin_inventory_flight_fk') {
          await tx.query('ROLLBACK TO SAVEPOINT inventory_capacity_provision');
          await tx.query('RELEASE SAVEPOINT inventory_capacity_provision');
          return false;
        }
      }
      throw error;
    }
  }

  async releaseLocked(tx: Tx, hold: StoredSeatHold): Promise<void> {
    if (hold.status === 'COMMITTED') {
      // Never clamp: the database CHECK must reject inconsistent or negative committed counts.
      const [, affected] = await tx.query<[unknown[], number]>(
        `UPDATE "cabin_inventory" SET "committedSeats" = "committedSeats" - $3
         WHERE "flightId" = $1 AND "cabin" = $2`,
        [hold.flightId, hold.cabin, hold.seats],
      );
      if (affected !== 1) throw new Error('Locked cabin disappeared during release');
    }
    const [, affected] = await tx.query<[{ id: string }[], number]>(
      `UPDATE "seat_holds" SET "status" = 'RELEASED'
       WHERE "id" = $1 AND "status" = $2 RETURNING "id"`,
      [hold.id, hold.status],
    );
    if (affected !== 1) throw new Error('Locked hold changed during release');
  }

  async updateCapacity(tx: Tx, flightId: string, cabin: Cabin, capacity: number): Promise<void> {
    await tx.query(
      'UPDATE "cabin_inventory" SET "capacity" = $3 WHERE "flightId" = $1 AND "cabin" = $2',
      [flightId, cabin, capacity],
    );
  }

  async insertHold(tx: Tx, hold: NewSeatHold): Promise<string> {
    const [created] = await tx.query<{ id: string }[]>(
      `INSERT INTO "seat_holds" ("bookingId", "flightId", "cabin", "seats", "status", "expiresAt")
       VALUES ($1, $2, $3, $4, 'HELD', $5) RETURNING "id"`,
      [hold.bookingId, hold.flightId, hold.cabin, hold.seats, hold.expiresAt],
    );
    return created.id;
  }

  async findAvailability(
    flightIds: readonly string[],
    now: Date,
    tx?: Tx,
  ): Promise<InventorySnapshot[]> {
    const rows = await this.findCabinLoad(flightIds, now, tx);
    return rows.map(({ flightId, cabin, availableSeats }) => ({ flightId, cabin, availableSeats }));
  }

  async findCabinLoad(flightIds: readonly string[], now: Date, tx?: Tx): Promise<CabinLoad[]> {
    if (flightIds.length === 0) return [];
    // One statement gives all cabins the same database snapshot, even at READ COMMITTED.
    // SUM(integer) is bigint in PostgreSQL; clamp before casting back to integer.
    return (tx ?? this.dataSource.manager).query<CabinLoad[]>(
      `SELECT inventory."flightId", inventory."cabin", inventory."capacity", inventory."committedSeats",
              COALESCE(SUM(hold."seats"), 0)::double precision AS "activeHeldSeats",
              GREATEST(0, inventory."capacity"::bigint - inventory."committedSeats"
                - COALESCE(SUM(hold."seats"), 0))::integer AS "availableSeats"
       FROM "cabin_inventory" inventory
       LEFT JOIN "seat_holds" hold
         ON hold."flightId" = inventory."flightId" AND hold."cabin" = inventory."cabin"
         AND hold."status" = 'HELD' AND hold."expiresAt" > $2
       WHERE inventory."flightId" = ANY($1::uuid[])
       GROUP BY inventory."flightId", inventory."cabin"
       ORDER BY inventory."flightId", inventory."cabin"`,
      [[...flightIds], now],
    );
  }
}
