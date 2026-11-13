import type { Tx } from '../../shared/db';
import type { Result } from '../../shared/result';
import type { CatalogApi, ChangeStatusError, FlightStatus } from '../flight-catalog/index';
import type { AdminCommand, CommandOutcome } from './admin-command';
import type { BookingOwners } from './booking-owners';

export interface UpdateFlightStatusInput {
  flightId: string;
  status: FlightStatus;
  /** Required for DELAYED: the new departure time. */
  estimatedDepartureUtc?: Date;
}

/** CANCELLED is refused here: cancelling needs the booking cascade of US-AD-04. */
export type UpdateFlightStatusFailure = ChangeStatusError | 'USE_CANCEL_FLIGHT';

/**
 * Concrete command for US-AD-02. Receiver: the Catalog, which owns the status table and decides
 * whether the transition is allowed. A delay is announced with FlightDelayed, carrying the owners
 * of the active bookings so observers need not ask anyone.
 */
export class UpdateFlightStatus implements AdminCommand<
  { status: FlightStatus },
  UpdateFlightStatusFailure
> {
  readonly name = 'UpdateFlightStatus';

  constructor(
    private readonly catalog: CatalogApi,
    private readonly owners: BookingOwners,
    private readonly input: UpdateFlightStatusInput,
    private readonly newEventId: () => string,
  ) {}

  execute(
    tx: Tx,
  ): Promise<Result<CommandOutcome<{ status: FlightStatus }>, UpdateFlightStatusFailure>> {
    void tx;
    return Promise.reject(new Error(`Not implemented: ${this.name}`));
  }
}
