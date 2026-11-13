import { randomUUID } from 'node:crypto';
import type { Tx } from '../../shared/db';
import { ok } from '../../shared/result';
import type { BookingOwners, FlightBookingCancellation } from '../booking/index';
import { type CatalogApi, type ChangeStatusError, FlightStatus } from '../flight-catalog/index';
import type { AdminCommand } from './admin-command';

export class CancelFlight implements AdminCommand<{ status: FlightStatus }, ChangeStatusError> {
  readonly name = 'CancelFlight';

  constructor(
    private readonly catalog: CatalogApi,
    private readonly bookings: FlightBookingCancellation,
    private readonly owners: BookingOwners,
    private readonly flightId: string,
    private readonly reason: string,
  ) {}

  async execute(tx: Tx) {
    const changed = await this.catalog.changeStatus(
      tx,
      this.flightId,
      FlightStatus.Cancelled,
      undefined,
      this.reason,
    );
    if (!changed.ok) return changed;
    const flight = await this.catalog.getFlight(this.flightId, tx);
    if (!flight) throw new Error('Flight disappeared during cancellation');
    const affectedUserIds = await this.owners.activeOwnersOf(tx, this.flightId);
    const cancelled = await this.bookings.cancelForFlight(tx, this.flightId);
    return ok({
      value: { status: FlightStatus.Cancelled },
      events: [
        ...cancelled,
        {
          type: 'FlightCancelled' as const,
          eventId: randomUUID(),
          flightId: flight.id,
          flightNumber: flight.flightNumber,
          departureTimeZone: flight.origin.timezone,
          departureUtc: flight.scheduledDepartureUtc.toISOString(),
          affectedUserIds,
        },
      ],
    });
  }
}
