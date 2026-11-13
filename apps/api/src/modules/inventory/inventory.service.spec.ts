import { describe, expect, it, vi } from 'vitest';
import type { Tx } from '../../shared/db';
import type { AvailabilityRequest } from './inventory-api';
import { InventoryService } from './inventory.service';

const FLIGHT = '00000000-0000-4000-8000-00000000000a';
const NOW = new Date('2026-11-11T12:00:00Z');
const request: AvailabilityRequest = {
  flightId: FLIGHT,
  cabin: 'ECONOMY',
  passengers: { adults: 1 },
};

function fixture() {
  const repository = {
    lockCabin: vi.fn(),
    insertHold: vi.fn(),
    findAvailability: vi
      .fn()
      .mockResolvedValue([{ flightId: FLIGHT, cabin: 'ECONOMY', availableSeats: 5 }]),
  };
  const clock = { now: vi.fn(() => NOW) };
  return { repository, clock, service: new InventoryService(repository, clock) };
}

describe('US-INV-01 Inventory service', () => {
  it('US-INV-01-U01 AC-4 empty requests need no database or clock access', async () => {
    const { service, repository, clock } = fixture();
    expect(await service.checkAvailability([])).toEqual({ ok: true, value: [] });
    expect(repository.findAvailability).not.toHaveBeenCalled();
    expect(clock.now).not.toHaveBeenCalled();
  });

  it('US-INV-01-U02 AC-2/4 deduplicates IDs, uses one clock and preserves different requests', async () => {
    const { service, repository, clock } = fixture();
    const tx = {} as Tx;
    const result = await service.checkAvailability(
      [
        { ...request, flightId: FLIGHT.toUpperCase() },
        { ...request, passengers: { adults: 4, children: 1, infants: 4 } },
        { ...request, passengers: { adults: 6 } },
        { ...request, cabin: 'BUSINESS' },
      ],
      tx,
    );
    expect(repository.findAvailability).toHaveBeenCalledExactlyOnceWith([FLIGHT], NOW, tx);
    expect(clock.now).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      value: [
        { requiredSeats: 1, canAccommodate: true },
        { requiredSeats: 5, canAccommodate: true },
        { requiredSeats: 6, canAccommodate: false },
        { availableSeats: 0, inventoryFound: false, canAccommodate: false },
      ],
    });
  });

  it.each([
    [null, 'INVALID_REQUEST'],
    [{ ...request, flightId: 'not-a-uuid' }, 'INVALID_FLIGHT_ID'],
    [{ ...request, cabin: 'FIRST' }, 'INVALID_CABIN'],
    [{ ...request, cabin: null }, 'INVALID_CABIN'],
    [{ ...request, passengers: null }, 'INVALID_PARTY'],
    [{ ...request, passengers: {} }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: 0 } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: -1 } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: 1.5 } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: '2' } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: NaN } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: Infinity } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: 1, children: -1 } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: 1, infants: 0.5 } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: 1, children: null } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: Number.MAX_SAFE_INTEGER, children: 1 } }, 'INVALID_PARTY'],
    [{ ...request, passengers: { adults: 1, infants: 2 } }, 'TOO_MANY_INFANTS'],
  ])(
    'US-INV-01-U03 AC-2/4 rejects invalid input %j before querying (%s)',
    async (invalid, error) => {
      const { service, repository } = fixture();
      // Exercise untyped callers without weakening the public contract.
      expect(
        await service.checkAvailability([request, invalid] as readonly AvailabilityRequest[]),
      ).toEqual({ ok: false, error });
      expect(repository.findAvailability).not.toHaveBeenCalled();
    },
  );

  it('US-INV-01-U04 AC-4 rejects a non-array batch', async () => {
    const { service, repository } = fixture();
    expect(await service.checkAvailability(null as unknown as AvailabilityRequest[])).toEqual({
      ok: false,
      error: 'INVALID_REQUEST',
    });
    expect(repository.findAvailability).not.toHaveBeenCalled();
  });

  it('US-INV-01-U05 AC-1 never exposes negative availability', async () => {
    const { service, repository } = fixture();
    repository.findAvailability.mockResolvedValue([
      { flightId: FLIGHT, cabin: 'ECONOMY', availableSeats: -3 },
    ]);
    expect(await service.checkAvailability([request])).toMatchObject({
      ok: true,
      value: [{ availableSeats: 0, canAccommodate: false }],
    });
  });
});
