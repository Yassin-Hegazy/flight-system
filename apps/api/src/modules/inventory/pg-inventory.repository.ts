import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Tx } from '../../shared/db';
import type { InventoryRepository, InventorySnapshot } from './inventory.repository';

@Injectable()
export class PgInventoryRepository implements InventoryRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
