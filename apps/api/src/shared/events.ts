import type { Tx } from './db';
import type { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Domain events (Observer pattern). A domain event is a fact in the past tense. The module where
 * it happened publishes it; any number of modules observe it, and the publisher never knows who
 * is listening. The events are the contract between modules, so they live here and carry
 * everything an observer needs, including who to tell: observers never call back into the
 * publishing module, which keeps the module graph free of cycles.
 *
 * Publishers must publish only after the database transaction that caused the event has
 * committed (see publishDomainEvent), otherwise a rolled-back change would still be announced.
 */

/** Instants travel as ISO-8601 UTC strings; observers convert them to local time for display. */
export type IsoInstant = string;

interface BookingEventFields {
  /** Unique per occurrence. Delivering the same event twice must not produce a second effect. */
  eventId: string;
  bookingId: string;
  /** The user who owns the booking, and therefore the one to tell. */
  ownerId: string;
  /** The public booking reference. Messages show this, never passenger or payment details. */
  ref: string;
}

interface FlightEventFields {
  eventId: string;
  flightId: string;
  /** The flight number shown to travelers, e.g. MS123. */
  flightNumber: string;
  /** IANA time zone of the departure airport, used to show departure times as local time. */
  departureTimeZone: string;
  /** Owners of the bookings on this flight that are still active (not expired or cancelled). */
  affectedUserIds: string[];
}

export const BOOKING_TICKET_VOID_IN_TX = 'BookingTicketVoidInTx';
export const BOOKING_CANCELLATION_IN_TX = 'BookingCancellationInTx';
export interface BookingCancellationInTx {
  tx: Tx;
  paymentId: string | null;
  bookingId: string;
}

export type CancellationReason = 'TRAVELER' | 'AIRLINE';

export type BookingConfirmed = { type: 'BookingConfirmed' } & BookingEventFields;
export type TicketsIssued = { type: 'TicketsIssued' } & BookingEventFields;
export type BookingExpired = { type: 'BookingExpired' } & BookingEventFields;
export type BookingCancelled = {
  type: 'BookingCancelled';
  reason: CancellationReason;
} & BookingEventFields;
export type FlightDelayed = {
  type: 'FlightDelayed';
  oldDepartureUtc: IsoInstant;
  newDepartureUtc: IsoInstant;
} & FlightEventFields;
export type FlightCancelled = {
  type: 'FlightCancelled';
  /** The departure that was cancelled. */
  departureUtc: IsoInstant;
} & FlightEventFields;

export type DomainEvent =
  | BookingConfirmed
  | TicketsIssued
  | BookingExpired
  | BookingCancelled
  | FlightDelayed
  | FlightCancelled;

export type DomainEventType = DomainEvent['type'];

/** The event with the given type, e.g. EventOf<'FlightDelayed'>. */
export type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;

/**
 * Publishes an event to every observer. The event's type is the name observers subscribe to.
 * Call it after the publishing transaction has committed. It resolves once every observer has
 * finished; observers log their own failures rather than throwing, so a failing observer never
 * undoes the action that caused the event.
 */
export async function publishDomainEvent(
  emitter: EventEmitter2,
  event: DomainEvent,
): Promise<void> {
  await emitter.emitAsync(event.type, event);
}
