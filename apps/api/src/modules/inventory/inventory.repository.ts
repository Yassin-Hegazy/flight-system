import type { Tx } from '../../shared/db';
import type { Cabin } from '../flight-catalog/index';

export interface InventorySnapshot {
  flightId: string;
  cabin: Cabin;
  availableSeats: number;
}

export interface NewSeatHold {
  bookingId: string;
  flightId: string;
  cabin: Cabin;
  seats: number;
  expiresAt: Date;
}

export interface InventoryRepository {
  findAvailability(flightIds: readonly string[], now: Date, tx?: Tx): Promise<InventorySnapshot[]>;
  /** Requires an active READ COMMITTED transaction; false if no cabin inventory exists. */
  lockCabin(tx: Tx, flightId: string, cabin: Cabin): Promise<boolean>;
  /** Call only after locking this cabin and verifying availability within the same transaction. */
  insertHold(tx: Tx, hold: NewSeatHold): Promise<string>;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
