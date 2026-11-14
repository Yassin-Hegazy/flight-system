import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { DomainEvent, EventOf } from '../../shared/events';
import { TrackedDepartureEntity } from './tracked-departure.entity';

/**
 * Observer: keeps the legs of ticketed bookings up to date from the events other modules publish,
 * so departure reminders need nothing but this module's own table.
 *
 * - TicketsIssued records each leg (its payload carries them).
 * - FlightDelayed moves the leg's departure, so the reminder follows the new time.
 * - FlightCancelled, BookingCancelled and BookingExpired forget the legs: nobody is reminded of a
 *   trip that will not happen (US-NT-06 AC-3).
 *
 * Like every observer here it never throws: a failure is logged with the event ID (NFR-OBS-01).
 */
@Injectable()
export class DepartureTracker implements OnModuleInit {
  private readonly logger = new Logger(DepartureTracker.name);

  constructor(
    private readonly events: EventEmitter2,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  onModuleInit(): void {
    const handlers: { [T in DomainEvent['type']]?: (event: EventOf<T>) => Promise<unknown> } = {
      TicketsIssued: (event) => this.track(event),
      FlightDelayed: (event) =>
        this.db.manager.update(
          TrackedDepartureEntity,
          { flightId: event.flightId },
          { departureUtc: new Date(event.newDepartureUtc), flightStatus: 'DELAYED' },
        ),
      FlightCancelled: (event) =>
        this.db.manager.delete(TrackedDepartureEntity, { flightId: event.flightId }),
      BookingCancelled: (event) =>
        this.db.manager.delete(TrackedDepartureEntity, { bookingId: event.bookingId }),
      BookingExpired: (event) =>
        this.db.manager.delete(TrackedDepartureEntity, { bookingId: event.bookingId }),
    };
    for (const [type, handler] of Object.entries(handlers)) {
      // One type at a time: EventEmitter2 reads an array of names as one namespaced event.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.events.on(type, (event: DomainEvent) => this.safely(event, handler));
    }
  }

  private async track(event: EventOf<'TicketsIssued'>): Promise<void> {
    if (event.legs.length === 0) return;
    await this.db.manager.upsert(
      TrackedDepartureEntity,
      event.legs.map((leg) => ({
        bookingId: event.bookingId,
        flightId: leg.flightId,
        ownerId: event.ownerId,
        ref: event.ref,
        flightNumber: leg.flightNumber,
        departureUtc: new Date(leg.departureUtc),
        departureTimeZone: leg.departureTimeZone,
      })),
      ['bookingId', 'flightId'],
    );
  }

  private async safely(
    event: DomainEvent,
    handler: (event: never) => Promise<unknown>,
  ): Promise<void> {
    try {
      await handler(event as never);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        { eventId: event.eventId, err: { name: failure.name, message: failure.message } },
        'Departure tracking failed',
      );
    }
  }
}
