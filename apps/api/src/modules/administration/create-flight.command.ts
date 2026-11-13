import type { Tx } from '../../shared/db';
import type { Result } from '../../shared/result';
import type { Cabin, CatalogApi, CreateFlightError, NewFlight } from '../flight-catalog/index';
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

  execute(tx: Tx): Promise<Result<CommandOutcome<{ id: string }>, CreateFlightFailure>> {
    void tx;
    return Promise.reject(new Error(`Not implemented: ${this.name}`));
  }
}
