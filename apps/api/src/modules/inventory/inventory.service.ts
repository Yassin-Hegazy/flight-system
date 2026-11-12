import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import { CLOCK, type Clock } from '../../shared/time';
import { isCabin } from '../flight-catalog/index';
import {
  DEFAULT_HOLD_DURATION_SECONDS,
  type Availability,
  type AvailabilityError,
  type AvailabilityRequest,
  type HoldError,
  type HoldRequest,
} from './inventory-api';
import { INVENTORY_REPOSITORY, type InventoryRepository } from './inventory.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
// Keep the declared readonly element type; Array.isArray's predicate otherwise widens it to any[].
const isRequestArray: (value: unknown) => boolean = Array.isArray;

@Injectable()
export class InventoryService {
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repository: InventoryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

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
    const validated: { request: AvailabilityRequest; requiredSeats: number }[] = [];
    for (const request of requests) {
      if (!request || typeof request !== 'object') return err('INVALID_REQUEST');
      if (typeof request.flightId !== 'string' || !UUID.test(request.flightId)) {
        return err('INVALID_FLIGHT_ID');
      }
      if (!isCabin(request.cabin)) return err('INVALID_CABIN');
      const party = request.passengers;
      if (!party || typeof party !== 'object') return err('INVALID_PARTY');
      const { adults, children = 0, infants = 0 } = party;
      if (![adults, children, infants].every(isCount)) return err('INVALID_PARTY');
      const requiredSeats = adults + children;
      if (!Number.isSafeInteger(requiredSeats) || requiredSeats === 0) return err('INVALID_PARTY');
      if (infants > adults) return err('TOO_MANY_INFANTS');
      // Copy inputs before awaiting so a caller cannot mutate the request while the query runs.
      validated.push({
        request: { ...request, flightId: request.flightId.toLowerCase() },
        requiredSeats,
      });
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

/** Pure validation and normalization, before any lock or asynchronous work. */
function validateHoldRequest(request: HoldRequest): Result<Required<HoldRequest>, HoldError> {
  if (!request || typeof request !== 'object') return err('INVALID_REQUEST');
  if (typeof request.bookingId !== 'string' || !UUID.test(request.bookingId))
    return err('INVALID_BOOKING_ID');
  if (typeof request.flightId !== 'string' || !UUID.test(request.flightId))
    return err('INVALID_FLIGHT_ID');
  if (!isCabin(request.cabin)) return err('INVALID_CABIN');
  if (!isCount(request.seats) || request.seats === 0 || request.seats > POSTGRES_INTEGER_MAX)
    return err('INVALID_SEAT_COUNT');
  const { durationSeconds = DEFAULT_HOLD_DURATION_SECONDS } = request;
  if (
    !isCount(durationSeconds) ||
    durationSeconds === 0 ||
    !Number.isSafeInteger(durationSeconds * 1000)
  ) {
    return err('INVALID_HOLD_DURATION');
  }
  // Snapshot before waiting for another transaction; never read a mutable caller object later.
  return ok({
    bookingId: request.bookingId.toLowerCase(),
    flightId: request.flightId.toLowerCase(),
    cabin: request.cabin,
    seats: request.seats,
    durationSeconds,
  });
}
