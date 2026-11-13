import type { Tx } from '../../shared/db';
import type { Cabin } from '../flight-catalog/index';
import type { CabinLoad } from './inventory-api';
import type { HoldStatus } from './seat-hold.entity';

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
export interface StoredSeatHold extends NewSeatHold {
  id: string;
  status: HoldStatus;
}

export interface InventoryRepository {
  findAvailability(flightIds: readonly string[], now: Date, tx?: Tx): Promise<InventorySnapshot[]>;
  /** Requires an active READ COMMITTED transaction; false if no cabin inventory exists. */
  lockCabin(tx: Tx, flightId: string, cabin: Cabin): Promise<boolean>;
  /** Call only after locking this cabin and verifying availability within the same transaction. */
  insertHold(tx: Tx, hold: NewSeatHold): Promise<string>;
  assertTransaction(tx: Tx): Promise<void>;
  findHold(tx: Tx, id: string): Promise<StoredSeatHold | null>;
  /** Read restricted to the expected booking. No write locks. */
  findPaymentHold(id: string, bookingId: string, tx?: Tx): Promise<StoredSeatHold | null>;
  lockHold(tx: Tx, id: string): Promise<StoredSeatHold | null>;
  commitHeld(tx: Tx, hold: StoredSeatHold): Promise<void>;
  /** Only called with both cabin and hold locked and a non-RELEASED current state. */
  releaseLocked(tx: Tx, hold: StoredSeatHold): Promise<void>;
  ensureCabin(tx: Tx, flightId: string, cabin: Cabin): Promise<boolean>;
  updateCapacity(tx: Tx, flightId: string, cabin: Cabin, capacity: number): Promise<void>;
  findCabinLoad(flightIds: readonly string[], now: Date, tx?: Tx): Promise<CabinLoad[]>;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
