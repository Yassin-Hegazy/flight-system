import { Inject, Injectable } from '@nestjs/common';
import { POSTGRES_INTEGER_MAX, type Tx } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import { CLOCK, type Clock } from '../../shared/time';
import { isCabin, type Cabin } from '../flight-catalog/index';
import {
  DEFAULT_HOLD_DURATION_SECONDS,
  type Availability,
  type AvailabilityError,
  type AvailabilityRequest,
  type HoldError,
  type HoldRequest,
  type CommitError,
  type CapacityError,
  type CabinLoad,
  type CabinLoadError,
  type HoldPaymentEligibility,
  type HoldValidationError,
  type ReleaseOutcome,
  type ReleaseError,
  type ReleaseOptions,
} from './inventory-api';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
  type StoredSeatHold,
} from './inventory.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isPositiveCount = (value: unknown): value is number => isCount(value) && value > 0;
const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
// Keep the declared readonly element type; Array.isArray's predicate otherwise widens it to any[].
const isRequestArray: (value: unknown) => boolean = Array.isArray;

@Injectable()
export class InventoryService {
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repository: InventoryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async release(
    tx: Tx,
    holdId: string,
    options: ReleaseOptions = {},
  ): Promise<Result<ReleaseOutcome, ReleaseError>> {
    if (!isUuid(holdId)) return err('INVALID_HOLD_ID');
    if (!isReleaseOptions(options)) return err('INVALID_REQUEST');
    const hold = await this.lockExistingHold(tx, holdId.toLowerCase());
    if (!hold || !this.isReleasable(hold, options.expiredOnly === true)) {
      return ok('ALREADY_RELEASED');
    }
    await this.repository.releaseLocked(tx, hold);
    return ok('RELEASED');
  }

  async commit(tx: Tx, holdId: string): Promise<Result<void, CommitError>> {
    if (!isUuid(holdId)) return err('INVALID_HOLD_ID');
    const id = holdId.toLowerCase();
    const hold = await this.lockExistingHold(tx, id);
    if (!hold) return err('NOT_HELD');
    const eligibilityError = this.holdEligibilityError(hold);
    if (eligibilityError) return err(eligibilityError);
    await this.repository.commitHeld(tx, hold);
    return ok(undefined);
  }

  async validateForPayment(
    holdId: string,
    bookingId: string,
    tx?: Tx,
  ): Promise<Result<HoldPaymentEligibility, HoldValidationError>> {
    if (!isUuid(holdId)) return err('INVALID_HOLD_ID');
    if (!isUuid(bookingId)) return err('INVALID_BOOKING_ID');
    const ids = [holdId.toLowerCase(), bookingId.toLowerCase()] as const;
    const hold = tx
      ? await this.repository.findPaymentHold(...ids, tx)
      : await this.repository.findPaymentHold(...ids);
    if (!hold) return err('NOT_HELD');
    const eligibilityError = this.holdEligibilityError(hold);
    if (eligibilityError) return err(eligibilityError);
    return ok({ holdId: hold.id, bookingId: hold.bookingId, expiresAt: new Date(hold.expiresAt) });
  }

  async setCapacity(
    tx: Tx,
    flightId: string,
    cabin: Cabin,
    capacity: number,
  ): Promise<Result<void, CapacityError>> {
    if (!isUuid(flightId)) return err('INVALID_FLIGHT_ID');
    if (!isCabin(cabin)) return err('INVALID_CABIN');
    if (!isCount(capacity) || capacity > POSTGRES_INTEGER_MAX) return err('INVALID_CAPACITY');
    const id = flightId.toLowerCase();
    if (!(await this.repository.ensureCabin(tx, id, cabin))) return err('FLIGHT_NOT_FOUND');
    if (!(await this.repository.lockCabin(tx, id, cabin)))
      throw new Error('Provisioned cabin disappeared');
    const rows = await this.repository.findCabinLoad([id], this.currentTime(), tx);
    const load = rows.find((row) => row.cabin === cabin);
    if (!load) throw new Error('Locked Inventory row was not returned by load query');
    if (capacity < load.committedSeats + load.activeHeldSeats) {
      return err({
        code: 'BELOW_SOLD',
        committedSeats: load.committedSeats,
        activeHeldSeats: load.activeHeldSeats,
      });
    }
    await this.repository.updateCapacity(tx, id, cabin, capacity);
    return ok(undefined);
  }

  async cabinLoad(flightId: string): Promise<Result<CabinLoad[], CabinLoadError>> {
    if (!isUuid(flightId)) return err('INVALID_FLIGHT_ID');
    const rows = await this.repository.findCabinLoad([flightId.toLowerCase()], this.currentTime());
    for (const row of rows) {
      if (row.capacity !== row.committedSeats + row.activeHeldSeats + row.availableSeats) {
        throw new Error('Stored Inventory exceeds capacity');
      }
    }
    return ok(rows);
  }

  private currentTime(): Date {
    const now = this.clock.now();
    if (!Number.isFinite(now.getTime()))
      throw new Error('Inventory clock returned an invalid timestamp');
    return now;
  }

  /** Identity read is unlocked; every lifecycle writer locks cabin BEFORE hold and rereads state. */
  private async lockExistingHold(tx: Tx, id: string): Promise<StoredSeatHold | null> {
    await this.repository.assertTransaction(tx);
    const identity = await this.repository.findHold(tx, id);
    if (!identity) return null;
    if (!(await this.repository.lockCabin(tx, identity.flightId, identity.cabin))) return null;
    const hold = await this.repository.lockHold(tx, id);
    if (hold && (hold.flightId !== identity.flightId || hold.cabin !== identity.cabin)) {
      throw new Error('Hold flight/cabin identity changed while acquiring Inventory locks');
    }
    return hold;
  }

  /** An expiry-only release touches nothing but a still-HELD hold at or past its expiry. */
  private isReleasable(hold: StoredSeatHold, expiredOnly: boolean): boolean {
    if (hold.status === 'RELEASED') return false;
    if (!expiredOnly) return true;
    return hold.status === 'HELD' && hold.expiresAt.getTime() <= this.currentTime().getTime();
  }

  /** Shared state/expiry rules; commit invokes this only after both database locks. */
  private holdEligibilityError(hold: StoredSeatHold): CommitError | undefined {
    if (hold.status === 'EXPIRED') return 'HOLD_EXPIRED';
    if (hold.status !== 'HELD') return 'NOT_HELD';
    if (hold.expiresAt.getTime() <= this.currentTime().getTime()) return 'HOLD_EXPIRED';
    return undefined;
  }

  async hold(tx: Tx, request: HoldRequest): Promise<Result<string, HoldError>> {
    const validated = validateHoldRequest(request);
    if (!validated.ok) return validated;
    const { bookingId, flightId, cabin, seats, durationSeconds } = validated.value;
    if (!(await this.repository.lockCabin(tx, flightId, cabin))) return err('INVENTORY_NOT_FOUND');

    const now = this.clock.now();
    if (!Number.isFinite(now.getTime()))
      throw new Error('Inventory clock returned an invalid timestamp');
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000);
    if (!Number.isFinite(expiresAt.getTime())) return err('INVALID_HOLD_DURATION');
    // A separate statement after the lock uses a fresh READ COMMITTED snapshot of active holds.
    const rows = await this.repository.findAvailability([flightId], now, tx);
    const available = rows.find((row) => row.flightId === flightId && row.cabin === cabin);
    if (!available) throw new Error('Locked Inventory row was not returned by availability query');
    if (seats > available.availableSeats) return err('SEATS_UNAVAILABLE');
    const id = await this.repository.insertHold(tx, {
      bookingId,
      flightId,
      cabin,
      seats,
      expiresAt,
    });
    return ok(id);
  }

  async checkAvailability(
    requests: readonly AvailabilityRequest[],
    tx?: Tx,
  ): Promise<Result<Availability[], AvailabilityError>> {
    if (!isRequestArray(requests)) return err('INVALID_REQUEST');
    const validated: ValidatedAvailabilityRequest[] = [];
    for (const request of requests) {
      const checked = validateAvailabilityRequest(request);
      if (!checked.ok) return checked;
      validated.push(checked.value);
    }
    if (validated.length === 0) return ok([]);

    const flightIds = [...new Set(validated.map(({ request }) => request.flightId))];
    const rows = await this.repository.findAvailability(flightIds, this.clock.now(), tx);
    const byCabin = new Map(rows.map((row) => [`${row.flightId}:${row.cabin}`, row]));
    return ok(
      validated.map(({ request, requiredSeats }) => {
        const row = byCabin.get(`${request.flightId}:${request.cabin}`);
        const availableSeats = Math.max(0, row?.availableSeats ?? 0);
        return {
          flightId: request.flightId,
          cabin: request.cabin,
          availableSeats,
          requiredSeats,
          canAccommodate: row !== undefined && availableSeats >= requiredSeats,
          inventoryFound: row !== undefined,
        };
      }),
    );
  }
}

interface ValidatedAvailabilityRequest {
  request: AvailabilityRequest;
  requiredSeats: number;
}

/** Only the documented option, with a boolean value, is accepted. */
function isReleaseOptions(options: unknown): options is ReleaseOptions {
  if (!isObject(options) || Array.isArray(options)) return false;
  if (Reflect.ownKeys(options).some((key) => key !== 'expiredOnly')) return false;
  const { expiredOnly } = options as ReleaseOptions;
  return expiredOnly === undefined || typeof expiredOnly === 'boolean';
}

/** Seats the party needs: adults and children. Infants are lap infants, at most one per adult. */
function seatsRequired(
  party: AvailabilityRequest['passengers'],
): Result<number, 'INVALID_PARTY' | 'TOO_MANY_INFANTS'> {
  if (!isObject(party)) return err('INVALID_PARTY');
  const { adults, children = 0, infants = 0 } = party;
  if (![adults, children, infants].every(isCount)) return err('INVALID_PARTY');
  const requiredSeats = adults + children;
  if (!Number.isSafeInteger(requiredSeats) || requiredSeats === 0) return err('INVALID_PARTY');
  if (infants > adults) return err('TOO_MANY_INFANTS');
  return ok(requiredSeats);
}

function validateAvailabilityRequest(
  request: AvailabilityRequest,
): Result<ValidatedAvailabilityRequest, AvailabilityError> {
  if (!isObject(request)) return err('INVALID_REQUEST');
  if (!isUuid(request.flightId)) return err('INVALID_FLIGHT_ID');
  if (!isCabin(request.cabin)) return err('INVALID_CABIN');
  const requiredSeats = seatsRequired(request.passengers);
  if (!requiredSeats.ok) return requiredSeats;
  // Copy inputs before awaiting so a caller cannot mutate the request while the query runs.
  return ok({
    request: { ...request, flightId: request.flightId.toLowerCase() },
    requiredSeats: requiredSeats.value,
  });
}

const isSeatCount = (value: unknown): value is number =>
  isPositiveCount(value) && value <= POSTGRES_INTEGER_MAX;
const isHoldDuration = (value: unknown): value is number =>
  isPositiveCount(value) && Number.isSafeInteger(value * 1000);

/** Pure validation and normalization, before any lock or asynchronous work. */
function validateHoldRequest(request: HoldRequest): Result<Required<HoldRequest>, HoldError> {
  if (!isObject(request)) return err('INVALID_REQUEST');
  if (!isUuid(request.bookingId)) return err('INVALID_BOOKING_ID');
  if (!isUuid(request.flightId)) return err('INVALID_FLIGHT_ID');
  if (!isCabin(request.cabin)) return err('INVALID_CABIN');
  if (!isSeatCount(request.seats)) return err('INVALID_SEAT_COUNT');
  const { durationSeconds = DEFAULT_HOLD_DURATION_SECONDS } = request;
  if (!isHoldDuration(durationSeconds)) return err('INVALID_HOLD_DURATION');
  // Snapshot before waiting for another transaction; never read a mutable caller object later.
  return ok({
    bookingId: request.bookingId.toLowerCase(),
    flightId: request.flightId.toLowerCase(),
    cabin: request.cabin,
    seats: request.seats,
    durationSeconds,
  });
}
