import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Tx } from '../../shared/db';
import type { Cabin } from '../flight-catalog/index';
import type { InventoryRepository, InventorySnapshot, NewSeatHold } from './inventory.repository';

@Injectable()
export class PgInventoryRepository implements InventoryRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async lockCabin(tx: Tx, flightId: string, cabin: Cabin): Promise<boolean> {
    const runner = tx?.queryRunner;
    if (!runner || runner.isReleased || !runner.isTransactionActive) {
      throw new Error('Inventory.hold requires an active caller transaction');
    }
    // At REPEATABLE READ a waiter could still see an old holds snapshot after obtaining the
    // lock, because inserting a hold does not update the inventory row. Enforce the contract.
    const [settings] = await tx.query<{ transaction_isolation: string }[]>(
      'SHOW transaction_isolation',
    );
    if (settings.transaction_isolation !== 'read committed') {
      throw new Error('Inventory.hold requires READ COMMITTED isolation');
    }
    const rows = await tx.query<{ flightId: string }[]>(
      `SELECT "flightId" FROM "cabin_inventory"
       WHERE "flightId" = $1 AND "cabin" = $2 FOR UPDATE`,
      [flightId, cabin],
    );
    return rows.length !== 0;
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
    if (flightIds.length === 0) return [];
    // One statement gives all cabins the same database snapshot, even at READ COMMITTED.
    // SUM(integer) is bigint in PostgreSQL; clamp before casting back to integer.
    return (tx ?? this.dataSource.manager).query<InventorySnapshot[]>(
      `SELECT inventory."flightId", inventory."cabin",
              GREATEST(0, inventory."capacity"::bigint - inventory."committedSeats"
                - COALESCE(SUM(hold."seats"), 0))::integer AS "availableSeats"
       FROM "cabin_inventory" inventory
       LEFT JOIN "seat_holds" hold
         ON hold."flightId" = inventory."flightId" AND hold."cabin" = inventory."cabin"
         AND hold."status" = 'HELD' AND hold."expiresAt" > $2
       WHERE inventory."flightId" = ANY($1::uuid[])
       GROUP BY inventory."flightId", inventory."cabin"`,
      [[...flightIds], now],
    );
  }
}
