import type { Tx } from '../../shared/db';
import type { Cabin } from '../flight-catalog/index';

export interface InventorySnapshot {
  flightId: string;
  cabin: Cabin;
  availableSeats: number;
}

export interface InventoryRepository {
  findAvailability(flightIds: readonly string[], now: Date, tx?: Tx): Promise<InventorySnapshot[]>;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
