import type { Tx } from '../../shared/db';
import type { Result } from '../../shared/result';
import type { Cabin, PassengerMix } from '../flight-catalog/index';

export interface AvailabilityRequest {
  readonly flightId: string;
  readonly cabin: Cabin;
  /** Adults and children require seats. Infants are lap infants, as in Catalog's PassengerMix. */
  readonly passengers: PassengerMix;
}

export interface Availability {
  readonly flightId: string;
  readonly cabin: Cabin;
  readonly availableSeats: number;
  readonly requiredSeats: number;
  readonly canAccommodate: boolean;
  /** False means the flight/cabin has not been provisioned; availability fails closed. */
  readonly inventoryFound: boolean;
}

export type AvailabilityError =
  'INVALID_REQUEST' | 'INVALID_FLIGHT_ID' | 'INVALID_CABIN' | 'INVALID_PARTY' | 'TOO_MANY_INFANTS';

export const DEFAULT_HOLD_DURATION_SECONDS = 15 * 60;

export interface HoldRequest {
  readonly bookingId: string;
  readonly flightId: string;
  readonly cabin: Cabin;
  /** Positive PostgreSQL integer; the caller supplies the number of passengers needing seats. */
  readonly seats: number;
  /** Positive whole seconds. Defaults to the 15-minute payment window. */
  readonly durationSeconds?: number;
}

export type HoldError =
  | 'INVALID_REQUEST'
  | 'INVALID_BOOKING_ID'
  | 'INVALID_FLIGHT_ID'
  | 'INVALID_CABIN'
  | 'INVALID_SEAT_COUNT'
  | 'INVALID_HOLD_DURATION'
  | 'INVENTORY_NOT_FOUND'
  | 'SEATS_UNAVAILABLE';

/** Availability snapshots and transactional seat reservations; no persistence types escape. */
export interface InventoryApi {
  /**
   * One result per request, in input order (including duplicates). Invalid input rejects the
   * whole batch before database access. An empty batch succeeds without querying.
   * Pass the caller's transaction manager to include its uncommitted Inventory writes.
   */
  checkAvailability(
    requests: readonly AvailabilityRequest[],
    tx?: Tx,
  ): Promise<Result<Availability[], AvailabilityError>>;

  /**
   * Requires an active caller-owned READ COMMITTED transaction. Returns the created hold UUID.
   * Locks (flightId, cabin) until the caller commits/rolls back; never starts/commits a transaction.
   * For multiple requests, callers lock in ascending normalized flight UUID, then cabin order.
   * A business error does not abort the transaction: callers must roll back any earlier booking
   * writes/holds on failure. Transaction misuse and unexpected database errors are thrown.
   */
  hold(tx: Tx, request: HoldRequest): Promise<Result<string, HoldError>>;
}

export const INVENTORY_API = Symbol('INVENTORY_API');
