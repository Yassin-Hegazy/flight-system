import { describe, expect, it, vi } from 'vitest';
import type { Tx } from '../../shared/db';
import { InventoryService } from './inventory.service';
import { InventoryFacade } from './inventory.facade';
import type { Cabin } from '../flight-catalog/index';

const FLIGHT = '00000000-0000-4000-8000-00000000000a';
const ID = '00000000-0000-4000-8000-00000000000b';
const TX = {} as Tx;
const NOW = new Date('2026-11-12T12:00:00Z');
function fixture() {
  const hold = {
    id: ID,
    bookingId: ID,
    flightId: FLIGHT,
    cabin: 'ECONOMY',
    seats: 2,
    status: 'HELD',
    expiresAt: new Date(NOW.getTime() + 1000),
  };
  const repository = {
    assertTransaction: vi.fn().mockResolvedValue(undefined),
    findHold: vi.fn().mockResolvedValue(hold),
    findPaymentHold: vi.fn().mockResolvedValue(hold),
    lockHold: vi.fn().mockResolvedValue(hold),
    lockCabin: vi.fn().mockResolvedValue(true),
    commitHeld: vi.fn().mockResolvedValue(undefined),
    ensureCabin: vi.fn().mockResolvedValue(true),
    updateCapacity: vi.fn().mockResolvedValue(undefined),
    findCabinLoad: vi.fn().mockResolvedValue([
      {
        flightId: FLIGHT,
        cabin: 'ECONOMY',
        capacity: 10,
        committedSeats: 2,
        activeHeldSeats: 3,
        availableSeats: 5,
      },
    ]),
    findAvailability: vi.fn(),
    insertHold: vi.fn(),
  };
  const clock = { now: vi.fn(() => NOW) };
  return {
    api: new InventoryFacade(new InventoryService(repository, clock)),
    repository,
    clock,
    hold,
  };
}
describe('FBS-23 commit and additional Inventory operations (unit)', () => {
  it('US-INV-03-U01 commit locks cabin before hold and samples the clock after both locks', async () => {
    const { api, repository, clock } = fixture();
    expect(await api.commit(TX, ID.toUpperCase())).toEqual({ ok: true, value: undefined });
    expect(repository.lockCabin).toHaveBeenCalledWith(TX, FLIGHT, 'ECONOMY');
    expect(repository.lockHold).toHaveBeenCalledWith(TX, ID);
    expect(repository.lockCabin.mock.invocationCallOrder[0]).toBeLessThan(
      repository.lockHold.mock.invocationCallOrder[0],
    );
    expect(repository.lockHold.mock.invocationCallOrder[0]).toBeLessThan(
      clock.now.mock.invocationCallOrder[0],
    );
    expect(repository.commitHeld).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ id: ID, seats: 2 }),
    );
  });
  it.each(['bad', '', null])(
    'US-INV-03-U02 invalid hold ID %s is rejected before persistence',
    async (id) => {
      const { api, repository } = fixture();
      expect(await api.commit(TX, id as string)).toEqual({ ok: false, error: 'INVALID_HOLD_ID' });
      expect(repository.findHold).not.toHaveBeenCalled();
    },
  );
  it('US-INV-03-U03 rechecks state after waiting, rather than trusting the identity read', async () => {
    const { api, repository, hold } = fixture();
    repository.lockHold.mockResolvedValue({ ...hold, status: 'COMMITTED' });
    expect(await api.commit(TX, ID)).toEqual({ ok: false, error: 'NOT_HELD' });
    expect(repository.commitHeld).not.toHaveBeenCalled();
  });
  it('US-INV-03-U04 a missing hold returns NOT_HELD', async () => {
    const { api, repository } = fixture();
    repository.findHold.mockResolvedValue(null);
    expect(await api.commit(TX, ID)).toEqual({ ok: false, error: 'NOT_HELD' });
    expect(repository.lockCabin).not.toHaveBeenCalled();
  });
  it.each(['assertTransaction', 'findHold', 'lockCabin', 'lockHold', 'commitHeld'] as const)(
    'US-INV-03-U05 unexpected %s failure propagates',
    async (method) => {
      const { api, repository } = fixture();
      const failure = new Error('database failed');
      repository[method].mockRejectedValue(failure);
      await expect(api.commit(TX, ID)).rejects.toBe(failure);
    },
  );
  it.each([
    ['bad', 'ECONOMY', 5, 'INVALID_FLIGHT_ID'],
    [FLIGHT, 'FIRST', 5, 'INVALID_CABIN'],
    ...[-1, 0.5, Infinity, NaN, 2_147_483_648, '5', null].map(
      (capacity) => [FLIGHT, 'ECONOMY', capacity, 'INVALID_CAPACITY'] as const,
    ),
  ] as const)('INV-CAP-U01 rejects %s / %s / %s (%s)', async (flightId, cabin, capacity, error) => {
    const { api, repository } = fixture();
    expect(await api.setCapacity(TX, flightId, cabin as Cabin, capacity as number)).toEqual({
      ok: false,
      error,
    });
    expect(repository.ensureCabin).not.toHaveBeenCalled();
  });
  it('INV-CAP-U02 returns the exact committed/held restriction and never updates on failure', async () => {
    const { api, repository } = fixture();
    expect(await api.setCapacity(TX, FLIGHT, 'ECONOMY', 4)).toEqual({
      ok: false,
      error: { code: 'BELOW_SOLD', committedSeats: 2, activeHeldSeats: 3 },
    });
    expect(repository.updateCapacity).not.toHaveBeenCalled();
    expect(await api.setCapacity(TX, FLIGHT, 'ECONOMY', 5)).toEqual({ ok: true, value: undefined });
  });
  it('INV-CAP-U03 missing flight fails closed', async () => {
    const { api, repository } = fixture();
    repository.ensureCabin.mockResolvedValue(false);
    expect(await api.setCapacity(TX, FLIGHT, 'ECONOMY', 5)).toEqual({
      ok: false,
      error: 'FLIGHT_NOT_FOUND',
    });
  });
  it('INV-LOAD-U01 invalid ID avoids a query; valid IDs normalize and use one clock', async () => {
    const { api, repository, clock } = fixture();
    expect(await api.cabinLoad('bad')).toEqual({ ok: false, error: 'INVALID_FLIGHT_ID' });
    expect(repository.findCabinLoad).not.toHaveBeenCalled();
    expect((await api.cabinLoad(FLIGHT.toUpperCase())).ok).toBe(true);
    expect(repository.findCabinLoad).toHaveBeenCalledWith([FLIGHT], NOW);
    expect(clock.now).toHaveBeenCalledTimes(1);
  });

  describe('Prepayment hold validation', () => {
    it('US-INV-03-PU01 returns booking-bound eligibility and original expiration', async () => {
      const { api, repository, hold } = fixture();
      expect(await api.validateForPayment(ID.toUpperCase(), ID.toUpperCase())).toEqual({
        ok: true,
        value: { holdId: ID, bookingId: ID, expiresAt: hold.expiresAt },
      });
      expect(repository.findPaymentHold).toHaveBeenCalledExactlyOnceWith(ID, ID);
    });
    it.each([
      [-1, true],
      [0, false],
      [1, false],
    ])('US-INV-03-PU02 expiration offset %i ms', async (offset, valid) => {
      const { api, clock, hold } = fixture();
      clock.now.mockReturnValue(new Date(hold.expiresAt.getTime() + offset));
      const result = await api.validateForPayment(ID, ID);
      expect(result.ok).toBe(valid);
      if (!valid) expect(result).toEqual({ ok: false, error: 'HOLD_EXPIRED' });
    });
    it.each([
      ['COMMITTED', 'NOT_HELD'],
      ['RELEASED', 'NOT_HELD'],
      ['EXPIRED', 'HOLD_EXPIRED'],
    ])('US-INV-03-PU03 %s agrees with commit (%s)', async (status, error) => {
      const { api, repository, hold } = fixture();
      repository.findPaymentHold.mockResolvedValue({ ...hold, status });
      expect(await api.validateForPayment(ID, ID)).toEqual({ ok: false, error });
    });
    it('US-INV-03-PU04 unknown or differently booked hold fails closed', async () => {
      const { api, repository } = fixture();
      repository.findPaymentHold.mockResolvedValue(null);
      expect(await api.validateForPayment(ID, ID)).toEqual({ ok: false, error: 'NOT_HELD' });
    });
    it.each(['bad', '', null])(
      'US-INV-03-PU05 malformed hold or booking identifier %s avoids persistence',
      async (invalid) => {
        const { api, repository } = fixture();
        expect(await api.validateForPayment(invalid as string, ID)).toEqual({
          ok: false,
          error: 'INVALID_HOLD_ID',
        });
        expect(await api.validateForPayment(ID, invalid as string)).toEqual({
          ok: false,
          error: 'INVALID_BOOKING_ID',
        });
        expect(repository.findPaymentHold).not.toHaveBeenCalled();
      },
    );
    it('US-INV-03-PU06 validation does not lock, mutate, start or require a transaction', async () => {
      const { api, repository } = fixture();
      expect((await api.validateForPayment(ID, ID)).ok).toBe(true);
      expect(repository.assertTransaction).not.toHaveBeenCalled();
      expect(repository.lockCabin).not.toHaveBeenCalled();
      expect(repository.lockHold).not.toHaveBeenCalled();
      expect(repository.commitHeld).not.toHaveBeenCalled();
      expect(repository.insertHold).not.toHaveBeenCalled();
      expect(repository.updateCapacity).not.toHaveBeenCalled();
    });
    it('US-INV-03-PU07 clock is sampled after the persisted lookup finishes', async () => {
      const { api, repository, clock, hold } = fixture();
      const lookup = Promise.withResolvers<typeof hold>();
      repository.findPaymentHold.mockReturnValue(lookup.promise);
      const operation = api.validateForPayment(ID, ID);
      expect(clock.now).not.toHaveBeenCalled();
      clock.now.mockReturnValue(new Date(hold.expiresAt));
      lookup.resolve(hold);
      expect(await operation).toEqual({ ok: false, error: 'HOLD_EXPIRED' });
    });
    it('US-INV-03-PU08 unexpected repository failures propagate', async () => {
      const { api, repository } = fixture();
      const failure = new Error('read failed');
      repository.findPaymentHold.mockRejectedValue(failure);
      await expect(api.validateForPayment(ID, ID)).rejects.toBe(failure);
    });
    it('US-INV-03-PU09 invalid clock values remain programming errors', async () => {
      const { api, clock } = fixture();
      clock.now.mockReturnValue(new Date(NaN));
      await expect(api.validateForPayment(ID, ID)).rejects.toThrow('invalid timestamp');
    });
    it('US-INV-03-PU10 returned timestamp cannot mutate a stored hold object', async () => {
      const { api, hold } = fixture();
      const expiry = hold.expiresAt.getTime();
      const result = await api.validateForPayment(ID, ID);
      if (!result.ok) throw new Error(result.error);
      result.value.expiresAt.setTime(0);
      expect(hold.expiresAt.getTime()).toBe(expiry);
    });
  });
});
