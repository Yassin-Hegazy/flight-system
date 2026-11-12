import { describe, expect, it, vi } from 'vitest';
import type { Tx } from '../../shared/db';
import type { HoldError, HoldRequest } from './inventory-api';
import { InventoryFacade } from './inventory.facade';
import { InventoryService } from './inventory.service';

const FLIGHT = '00000000-0000-4000-8000-00000000000a';
const BOOKING = '00000000-0000-4000-8000-00000000000b';
const HOLD = '00000000-0000-4000-8000-00000000000c';
const NOW = new Date('2026-11-12T12:00:00Z');
const TX = {} as Tx;
const request: HoldRequest = { bookingId: BOOKING, flightId: FLIGHT, cabin: 'ECONOMY', seats: 1 };

function fixture() {
  const repository = {
    assertTransaction: vi.fn(),
    findHold: vi.fn(),
    findPaymentHold: vi.fn(),
    lockHold: vi.fn(),
    commitHeld: vi.fn(),
    ensureCabin: vi.fn(),
    updateCapacity: vi.fn(),
    findCabinLoad: vi.fn(),
    lockCabin: vi.fn().mockResolvedValue(true),
    findAvailability: vi
      .fn()
      .mockResolvedValue([{ flightId: FLIGHT, cabin: 'ECONOMY', availableSeats: 3 }]),
    insertHold: vi.fn().mockResolvedValue(HOLD),
  };
  const clock = { now: vi.fn(() => NOW) };
  const facade = new InventoryFacade(new InventoryService(repository, clock));
  return { facade, repository, clock };
}

describe('US-INV-02 hold validation and workflow', () => {
  it('US-INV-02-U01 AC-1 locks before sampling the clock and reading; inserts a 15-minute hold in the caller transaction', async () => {
    const { facade, repository, clock } = fixture();
    expect(await facade.hold(TX, request)).toEqual({ ok: true, value: HOLD });
    expect(repository.lockCabin).toHaveBeenCalledExactlyOnceWith(TX, FLIGHT, 'ECONOMY');
    expect(repository.findAvailability).toHaveBeenCalledExactlyOnceWith([FLIGHT], NOW, TX);
    expect(repository.insertHold).toHaveBeenCalledExactlyOnceWith(TX, {
      bookingId: BOOKING,
      flightId: FLIGHT,
      cabin: 'ECONOMY',
      seats: 1,
      expiresAt: new Date(NOW.getTime() + 900_000),
    });
    expect(repository.lockCabin.mock.invocationCallOrder[0]).toBeLessThan(
      clock.now.mock.invocationCallOrder[0],
    );
    expect(clock.now.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findAvailability.mock.invocationCallOrder[0],
    );
    expect(repository.findAvailability.mock.invocationCallOrder[0]).toBeLessThan(
      repository.insertHold.mock.invocationCallOrder[0],
    );
    expect(clock.now).toHaveBeenCalledTimes(1);
  });

  const invalidRequests: [unknown, HoldError][] = [
    [null, 'INVALID_REQUEST'],
    [{ ...request, bookingId: 'bad' }, 'INVALID_BOOKING_ID'],
    [{ ...request, bookingId: null }, 'INVALID_BOOKING_ID'],
    [{ ...request, flightId: 'bad' }, 'INVALID_FLIGHT_ID'],
    [{ ...request, cabin: 'FIRST' }, 'INVALID_CABIN'],
    [{ ...request, cabin: null }, 'INVALID_CABIN'],
    ...[
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      '1',
      null,
      undefined,
      2_147_483_648,
      Number.MAX_SAFE_INTEGER + 1,
    ].map((seats): [unknown, HoldError] => [{ ...request, seats }, 'INVALID_SEAT_COUNT']),
    ...[
      0,
      -1,
      0.5,
      NaN,
      Infinity,
      '900',
      null,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
    ].map((durationSeconds): [unknown, HoldError] => [
      { ...request, durationSeconds },
      'INVALID_HOLD_DURATION',
    ]),
  ];
  it.each(invalidRequests)(
    'US-INV-02-U02 AC-1 rejects invalid input %j (%s) before locking',
    async (input, error) => {
      const { facade, repository, clock } = fixture();
      expect(await facade.hold(TX, input as HoldRequest)).toEqual({ ok: false, error });
      expect(repository.lockCabin).not.toHaveBeenCalled();
      expect(repository.findAvailability).not.toHaveBeenCalled();
      expect(repository.insertHold).not.toHaveBeenCalled();
      expect(clock.now).not.toHaveBeenCalled();
    },
  );

  it.each([
    [2, true],
    [3, true],
    [4, false],
  ])(
    'US-INV-02-U03 AC-1/3 seat boundary %i against three remaining seats',
    async (seats, succeeds) => {
      const { facade, repository } = fixture();
      expect(await facade.hold(TX, { ...request, seats })).toEqual(
        succeeds ? { ok: true, value: HOLD } : { ok: false, error: 'SEATS_UNAVAILABLE' },
      );
      expect(repository.insertHold).toHaveBeenCalledTimes(succeeds ? 1 : 0);
    },
  );

  it('US-INV-02-U04 AC-1 missing Inventory fails closed without inserting', async () => {
    const { facade, repository, clock } = fixture();
    repository.lockCabin.mockResolvedValue(false);
    expect(await facade.hold(TX, request)).toEqual({ ok: false, error: 'INVENTORY_NOT_FOUND' });
    expect(clock.now).not.toHaveBeenCalled();
    expect(repository.insertHold).not.toHaveBeenCalled();
  });

  it('US-INV-02-U05 AC-1 normalizes UUIDs, accepts the PostgreSQL integer limit and custom duration', async () => {
    const { facade, repository } = fixture();
    repository.findAvailability.mockResolvedValue([
      { flightId: FLIGHT, cabin: 'ECONOMY', availableSeats: 2_147_483_647 },
    ]);
    expect(
      await facade.hold(TX, {
        ...request,
        flightId: FLIGHT.toUpperCase(),
        bookingId: BOOKING.toUpperCase(),
        seats: 2_147_483_647,
        durationSeconds: 1,
      }),
    ).toEqual({ ok: true, value: HOLD });
    expect(repository.insertHold).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        flightId: FLIGHT,
        bookingId: BOOKING,
        seats: 2_147_483_647,
        expiresAt: new Date(NOW.getTime() + 1000),
      }),
    );
  });

  it('US-INV-02-U06 AC-1 rejects a duration whose expiration exceeds the Date range', async () => {
    const { facade, repository, clock } = fixture();
    clock.now.mockReturnValue(new Date(8_640_000_000_000_000 - 500));
    expect(await facade.hold(TX, { ...request, durationSeconds: 1 })).toEqual({
      ok: false,
      error: 'INVALID_HOLD_DURATION',
    });
    expect(repository.insertHold).not.toHaveBeenCalled();
  });

  it.each(['lockCabin', 'findAvailability', 'insertHold'] as const)(
    'US-INV-02-U07 AC-4 propagates unexpected %s failures',
    async (method) => {
      const { facade, repository } = fixture();
      const failure = new Error('database failure');
      repository[method].mockRejectedValue(failure);
      await expect(facade.hold(TX, request)).rejects.toBe(failure);
    },
  );

  it('US-INV-02-U08 AC-1 samples the clock only after the lock promise resolves and snapshots input', async () => {
    const { facade, repository, clock } = fixture();
    const locked = Promise.withResolvers<boolean>();
    repository.lockCabin.mockReturnValue(locked.promise);
    const input = { ...request };
    const operation = facade.hold(TX, input);
    expect(clock.now).not.toHaveBeenCalled();
    input.seats = 99;
    input.flightId = BOOKING;
    locked.resolve(true);
    expect(await operation).toEqual({ ok: true, value: HOLD });
    expect(repository.insertHold).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ flightId: FLIGHT, seats: 1 }),
    );
  });
});
