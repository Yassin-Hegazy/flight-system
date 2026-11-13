import { Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import type { AvailabilityRequest, HoldRequest, InventoryApi } from './inventory-api';
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
}
