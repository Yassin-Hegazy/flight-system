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

export type CommitError = 'INVALID_HOLD_ID' | 'HOLD_EXPIRED' | 'NOT_HELD';
export type HoldValidationError = CommitError | 'INVALID_BOOKING_ID';
export type ReleaseOutcome = 'RELEASED' | 'ALREADY_RELEASED';
export type ReleaseError = 'INVALID_HOLD_ID' | 'INVALID_REQUEST';
export interface ReleaseOptions {
  /** Expiry callers must use this: only a still-HELD row at/past expiry may be released. */
  readonly expiredOnly?: boolean;
}
export interface HoldPaymentEligibility {
  readonly holdId: string;
  readonly bookingId: string;
  /** Original expiration: eligibility checks never renew or extend it. */
  readonly expiresAt: Date;
}
export interface CabinLoad {
  readonly flightId: string;
  readonly cabin: Cabin;
  readonly capacity: number;
  readonly committedSeats: number;
  readonly activeHeldSeats: number;
  readonly availableSeats: number;
}
export type CapacityError =
  | 'INVALID_FLIGHT_ID'
  | 'INVALID_CABIN'
  | 'INVALID_CAPACITY'
  | 'FLIGHT_NOT_FOUND'
  | {
      readonly code: 'BELOW_SOLD';
      readonly committedSeats: number;
      readonly activeHeldSeats: number;
    };
export type CabinLoadError = 'INVALID_FLIGHT_ID';

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

  /** Cabin first, then hold lock; validates expiry after both. Duplicate commits return NOT_HELD.
   * Requires an active caller-owned READ COMMITTED transaction, as does setCapacity. */
  commit(tx: Tx, holdId: string): Promise<Result<void, CommitError>>;
  /** Caller-owned READ COMMITTED transaction; cabin then hold locks. Missing/already released
   * rows are idempotent no-ops. Expiry-only calls also skip unexpired or non-HELD reservations.
   * Only releasing COMMITTED seats decrements the committed count. Caller owns authorization. */
  release(
    tx: Tx,
    holdId: string,
    options?: ReleaseOptions,
  ): Promise<Result<ReleaseOutcome, ReleaseError>>;
  /** Read-only eligibility snapshot for the expected booking; not customer authorization.
   * Call after booking/hold creation commits. No locks or transaction span an external payment.
   * Booking must authorize the customer and still call commit after payment, which revalidates. */
  validateForPayment(
    holdId: string,
    bookingId: string,
    tx?: Tx,
  ): Promise<Result<HoldPaymentEligibility, HoldValidationError>>;
  /** Provision/update without displacing committed seats or active holds. */
  setCapacity(
    tx: Tx,
    flightId: string,
    cabin: Cabin,
    capacity: number,
  ): Promise<Result<void, CapacityError>>;
  /** One snapshot for all provisioned cabins; missing/unprovisioned flights return ok([]). */
  cabinLoad(flightId: string): Promise<Result<CabinLoad[], CabinLoadError>>;
}

export const INVENTORY_API = Symbol('INVENTORY_API');
