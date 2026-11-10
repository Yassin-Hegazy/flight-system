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

/** Read-only snapshot, not a seat reservation or a guarantee against concurrent bookings. */
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
}

export const INVENTORY_API = Symbol('INVENTORY_API');
