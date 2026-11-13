import type { Tx } from '../../shared/db';
import type { FlightDelayed } from '../../shared/events';
import { err, ok, type Result } from '../../shared/result';
import {
  type CatalogApi,
  type ChangeStatusError,
  type FlightInfo,
  FlightStatus,
} from '../flight-catalog/index';
import type { AdminCommand, CommandOutcome } from './admin-command';
import type { BookingOwners } from './booking-owners';

export interface UpdateFlightStatusInput {
  flightId: string;
  status: FlightStatus;
  /** Required for DELAYED: the new departure time. */
  estimatedDepartureUtc?: Date;
}

export interface StatusChanged {
  status: FlightStatus;
  /** What the Catalog says the flight was before this change. */
  previousStatus: FlightStatus;
}

/** CANCELLED is refused here: cancelling needs the booking cascade of US-AD-04. */
export type UpdateFlightStatusFailure = ChangeStatusError | 'USE_CANCEL_FLIGHT';

/**
 * Concrete command for US-AD-02. Receiver: the Catalog, which owns the status table and decides
 * whether the transition is allowed. A delay is announced with FlightDelayed, carrying the owners
 * of the active bookings so observers need not ask anyone.
 */
export class UpdateFlightStatus implements AdminCommand<StatusChanged, UpdateFlightStatusFailure> {
  readonly name = 'UpdateFlightStatus';

  constructor(
    private readonly catalog: CatalogApi,
    private readonly owners: BookingOwners,
    private readonly input: UpdateFlightStatusInput,
    private readonly newEventId: () => string,
  ) {}

  async execute(tx: Tx): Promise<Result<CommandOutcome<StatusChanged>, UpdateFlightStatusFailure>> {
    const { flightId, status, estimatedDepartureUtc } = this.input;
    if (status === FlightStatus.Cancelled) return err('USE_CANCEL_FLIGHT');
    const flight = await this.catalog.getFlight(flightId);
    if (!flight) return err('FLIGHT_NOT_FOUND');

    const changed = await this.catalog.changeStatus(tx, flightId, status, estimatedDepartureUtc);
    if (!changed.ok) return changed;

    const delayed = status === FlightStatus.Delayed && estimatedDepartureUtc !== undefined;
    return ok({
      value: { status, previousStatus: changed.value },
      events: delayed ? [await this.flightDelayed(flight, estimatedDepartureUtc)] : [],
    });
  }

  private async flightDelayed(flight: FlightInfo, newDeparture: Date): Promise<FlightDelayed> {
    return {
      type: 'FlightDelayed',
      eventId: this.newEventId(),
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      departureTimeZone: flight.origin.timezone,
      affectedUserIds: await this.owners.activeOwnersOf(flight.id),
      oldDepartureUtc: flight.scheduledDepartureUtc.toISOString(),
      newDepartureUtc: newDeparture.toISOString(),
    };
  }
}
