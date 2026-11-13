import type { Tx } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import {
  CABINS,
  type Cabin,
  type CatalogApi,
  type CreateFlightError,
  type NewFlight,
} from '../flight-catalog/index';
import type { InventoryApi } from '../inventory/index';
import type { AdminCommand, CommandOutcome } from './admin-command';

export interface CreateFlightInput {
  flight: NewFlight;
  /** Seats per cabin: zero or more, and at least one cabin above zero (US-AD-01 AC-3). */
  capacity: Record<Cabin, number>;
}

export type CreateFlightFailure = CreateFlightError | 'NO_SEATS';

/**
 * Concrete command for US-AD-01. Receivers: the Catalog creates the flight and its fares, Inventory
 * sets each cabin's capacity. Both happen in the bus's transaction, so a flight never exists
 * without its seats.
 */
export class CreateFlight implements AdminCommand<{ id: string }, CreateFlightFailure> {
  readonly name = 'CreateFlight';

  constructor(
    private readonly catalog: CatalogApi,
    private readonly inventory: InventoryApi,
    private readonly input: CreateFlightInput,
  ) {}

  async execute(tx: Tx): Promise<Result<CommandOutcome<{ id: string }>, CreateFlightFailure>> {
    const { flight, capacity } = this.input;
    if (!CABINS.some((cabin) => capacity[cabin] > 0)) return err('NO_SEATS');

    const created = await this.catalog.createFlight(tx, flight);
    if (!created.ok) return created;

    for (const cabin of CABINS) {
      const set = await this.inventory.setCapacity(tx, created.value, cabin, capacity[cabin]);
      // Nothing is sold on a flight created a moment ago, so a refusal here is a fault.
      if (!set.ok) throw new Error(`Inventory refused capacity: ${JSON.stringify(set.error)}`);
    }
    return ok({ value: { id: created.value } });
  }
}
