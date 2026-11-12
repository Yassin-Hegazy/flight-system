import { describe, expect, it, vi } from 'vitest';
import type { Tx } from '../../shared/db';
import type { ReleaseOptions, ReleaseOutcome } from './inventory-api';
import { InventoryFacade } from './inventory.facade';
import { InventoryService } from './inventory.service';

const ID = '00000000-0000-4000-8000-00000000000a';
const FLIGHT = '00000000-0000-4000-8000-00000000000b';
const NOW = new Date('2026-11-12T12:00:00Z');
const TX = {} as Tx;
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
    lockCabin: vi.fn().mockResolvedValue(true),
    lockHold: vi.fn().mockResolvedValue(hold),
    releaseLocked: vi.fn().mockResolvedValue(undefined),
    findAvailability: vi.fn(),
    insertHold: vi.fn(),
    findPaymentHold: vi.fn(),
    commitHeld: vi.fn(),
    ensureCabin: vi.fn(),
    updateCapacity: vi.fn(),
    findCabinLoad: vi.fn(),
  };
  const clock = { now: vi.fn(() => NOW) };
  return {
    api: new InventoryFacade(new InventoryService(repository, clock)),
    repository,
    clock,
    hold,
  };
}
describe('US-INV-04 release (unit)', () => {
  const validOptions: [ReleaseOptions | undefined, ReleaseOutcome][] = [
    [undefined, 'RELEASED'],
    [{}, 'RELEASED'],
    [{ expiredOnly: true }, 'ALREADY_RELEASED'],
    [{ expiredOnly: false }, 'RELEASED'],
    [{ expiredOnly: undefined }, 'RELEASED'],
  ];
  it.each(validOptions)(
    'US-INV-04-U10 documented options %j preserve outcome %s',
    async (options, outcome) => {
      const { api } = fixture();
      expect(await api.release(TX, ID, options)).toEqual({ ok: true, value: outcome });
    },
  );
  const malformedOptions: [string, unknown][] = [
    ['misspelled key', { expireOnly: true }],
    ['extra key with valid expiry guard', { expiredOnly: true, unknown: 123 }],
    ['string instead of boolean', { expiredOnly: 'true' }],
    ['non-enumerable unknown key', Object.defineProperty({}, 'expireOnly', { value: true })],
    ['symbol key', { [Symbol('unknown')]: true }],
  ];
  it.each(malformedOptions)(
    'US-INV-04-U11 rejects %s without any database access',
    async (_label, input) => {
      const { api, repository, clock } = fixture();
      // Deliberately bypass static checking only to exercise malformed runtime configurations.
      expect(await api.release(TX, ID, input as ReleaseOptions)).toEqual({
        ok: false,
        error: 'INVALID_REQUEST',
      });
      for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
      expect(clock.now).not.toHaveBeenCalled();
    },
  );
  it.each([null, [], { expiredOnly: 'yes' }, { expiredOnly: 1 }])(
    'US-INV-04-U09 invalid expiry options %j do not access persistence',
    async (options) => {
      const { api, repository, clock } = fixture();
      expect(await api.release(TX, ID, options as ReleaseOptions)).toEqual({
        ok: false,
        error: 'INVALID_REQUEST',
      });
      for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
      expect(clock.now).not.toHaveBeenCalled();
    },
  );
  it('US-INV-04-U01 uses caller transaction and cabin-first lock order, preserving history', async () => {
    const { api, repository, hold } = fixture();
    expect(await api.release(TX, ID.toUpperCase())).toEqual({ ok: true, value: 'RELEASED' });
    expect(repository.findHold).toHaveBeenCalledWith(TX, ID);
    expect(repository.lockCabin).toHaveBeenCalledWith(TX, FLIGHT, 'ECONOMY');
    expect(repository.lockHold).toHaveBeenCalledWith(TX, ID);
    expect(repository.lockCabin.mock.invocationCallOrder[0]).toBeLessThan(
      repository.lockHold.mock.invocationCallOrder[0],
    );
    expect(repository.releaseLocked).toHaveBeenCalledExactlyOnceWith(TX, hold);
  });
  it.each(['HELD', 'COMMITTED', 'EXPIRED'])(
    'US-INV-04-U02 cancellation releases %s',
    async (status) => {
      const { api, repository, hold } = fixture();
      repository.lockHold.mockResolvedValue({ ...hold, status });
      expect(await api.release(TX, ID)).toEqual({ ok: true, value: 'RELEASED' });
    },
  );
  it('US-INV-04-U03 rereads RELEASED state after waiting and performs no update', async () => {
    const { api, repository, hold } = fixture();
    repository.lockHold.mockResolvedValue({ ...hold, status: 'RELEASED' });
    expect(await api.release(TX, ID)).toEqual({ ok: true, value: 'ALREADY_RELEASED' });
    expect(repository.releaseLocked).not.toHaveBeenCalled();
  });
  it.each(['bad', '', null])(
    'US-INV-04-U04 invalid identifier %s is a typed error before persistence',
    async (id) => {
      const { api, repository } = fixture();
      expect(await api.release(TX, id as string)).toEqual({ ok: false, error: 'INVALID_HOLD_ID' });
      expect(repository.findHold).not.toHaveBeenCalled();
    },
  );
  it('US-INV-04-U05 a missing hold has nothing left to release', async () => {
    const { api, repository } = fixture();
    repository.findHold.mockResolvedValue(null);
    expect(await api.release(TX, ID)).toEqual({ ok: true, value: 'ALREADY_RELEASED' });
    expect(repository.releaseLocked).not.toHaveBeenCalled();
  });
  it.each([
    [-1, false],
    [0, true],
    [1, true],
  ])('US-INV-04-U06 expiry-only boundary offset %i', async (offset, releases) => {
    const { api, repository, hold, clock } = fixture();
    clock.now.mockReturnValue(new Date(hold.expiresAt.getTime() + offset));
    expect(await api.release(TX, ID, { expiredOnly: true })).toEqual({
      ok: true,
      value: releases ? 'RELEASED' : 'ALREADY_RELEASED',
    });
    expect(repository.releaseLocked).toHaveBeenCalledTimes(releases ? 1 : 0);
  });
  it.each(['COMMITTED', 'RELEASED', 'EXPIRED'])(
    'US-INV-04-U07 expiry never cancels %s state',
    async (status) => {
      const { api, repository, hold, clock } = fixture();
      clock.now.mockReturnValue(new Date(hold.expiresAt.getTime() + 1));
      repository.lockHold.mockResolvedValue({ ...hold, status });
      expect(await api.release(TX, ID, { expiredOnly: true })).toEqual({
        ok: true,
        value: 'ALREADY_RELEASED',
      });
      expect(repository.releaseLocked).not.toHaveBeenCalled();
    },
  );
  it.each(['assertTransaction', 'findHold', 'lockCabin', 'lockHold', 'releaseLocked'] as const)(
    'US-INV-04-U08 unexpected %s errors propagate',
    async (method) => {
      const { api, repository } = fixture();
      const error = new Error('unexpected database failure');
      repository[method].mockRejectedValue(error);
      await expect(api.release(TX, ID)).rejects.toBe(error);
    },
  );
});
