import { Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import type { Cabin } from '../flight-catalog/index';
import type {
  AvailabilityRequest,
  HoldRequest,
  InventoryApi,
  ReleaseOptions,
} from './inventory-api';
import { InventoryService } from './inventory.service';

/** The only Inventory use-case entry point exported to other modules. */
@Injectable()
export class InventoryFacade implements InventoryApi {
  constructor(private readonly inventory: InventoryService) {}

  checkAvailability(requests: readonly AvailabilityRequest[], tx?: Tx) {
    return this.inventory.checkAvailability(requests, tx);
  }

  hold(tx: Tx, request: HoldRequest) {
    return this.inventory.hold(tx, request);
  }

  commit(tx: Tx, holdId: string) {
    return this.inventory.commit(tx, holdId);
  }
  release(tx: Tx, holdId: string, options?: ReleaseOptions) {
    return this.inventory.release(tx, holdId, options);
  }
  validateForPayment(holdId: string, bookingId: string) {
    return this.inventory.validateForPayment(holdId, bookingId);
  }
  setCapacity(tx: Tx, flightId: string, cabin: Cabin, capacity: number) {
    return this.inventory.setCapacity(tx, flightId, cabin, capacity);
  }
  cabinLoad(flightId: string) {
    return this.inventory.cabinLoad(flightId);
  }
}
