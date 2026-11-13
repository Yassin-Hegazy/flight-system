import type { Tx } from '../../shared/db';
import { ok } from '../../shared/result';
import type { Cabin } from '../flight-catalog/index';
import type { CapacityError, InventoryApi } from '../inventory/index';
import type { AdminCommand } from './admin-command';

export class ConfigureCapacity implements AdminCommand<{ capacity: number }, CapacityError> {
  readonly name = 'ConfigureCapacity';

  constructor(
    private readonly inventory: InventoryApi,
    private readonly flightId: string,
    private readonly cabin: Cabin,
    private readonly capacity: number,
  ) {}

  async execute(tx: Tx) {
    const changed = await this.inventory.changeCapacity(
      tx,
      this.flightId,
      this.cabin,
      this.capacity,
    );
    if (!changed.ok) return changed;
    return ok({
      value: { capacity: this.capacity },
      audit: [
        {
          target: `${this.flightId}/${this.cabin}`,
          flightId: this.flightId,
          before: { capacity: changed.value },
          after: { capacity: this.capacity },
        },
      ],
    });
  }
}
