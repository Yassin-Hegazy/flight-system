import { describe, expect, it } from 'vitest';
import { err } from '../../shared/result';
import { ConfigureCapacity } from './configure-capacity.command';
import { UpdateFare } from './update-fare.command';
import {
  asAdmin,
  asTraveler,
  egp,
  FakeCatalog,
  fakeBus,
  FakeInventory,
  FLIGHT_ID,
  TX,
} from './test-support';

describe('US-AD-03 Configure capacity and fares (commands)', () => {
  it('US-AD-03-T01 a traveler is refused and Inventory is never asked', async () => {
    const inventory = new FakeInventory();
    const { bus, log } = fakeBus();

    await expect(
      bus.dispatch(new ConfigureCapacity(inventory.api, FLIGHT_ID, 'ECONOMY', 2), asTraveler()),
    ).rejects.toMatchObject({ status: 403 });
    expect(inventory.capacities).toEqual([]);
    expect(log).toEqual([]);
  });

  it('US-AD-03-T08 changes capacity through Inventory and audits the capacity it replaced', async () => {
    const inventory = new FakeInventory();

    const result = await new ConfigureCapacity(inventory.api, FLIGHT_ID, 'ECONOMY', 2).execute(TX);

    expect(inventory.capacities).toEqual([
      { tx: TX, flightId: FLIGHT_ID, cabin: 'ECONOMY', capacity: 2 },
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        value: { capacity: 2 },
        audit: [
          {
            target: `${FLIGHT_ID}/ECONOMY`,
            flightId: FLIGHT_ID,
            before: { capacity: 3 },
            after: { capacity: 2 },
          },
        ],
      },
    });
  });

  it("US-AD-03-T09 Inventory's refusal, stating committed and held seats, rolls back with no audit", async () => {
    const inventory = new FakeInventory();
    const belowSold = { code: 'BELOW_SOLD', committedSeats: 60, activeHeldSeats: 5 } as const;
    inventory.changeResult = err(belowSold);
    const { bus, log, audits } = fakeBus();

    const result = await bus.dispatch(
      new ConfigureCapacity(inventory.api, FLIGHT_ID, 'ECONOMY', 64),
      asAdmin(),
    );

    expect(result).toEqual({ ok: false, error: belowSold });
    expect(log).toEqual(['begin', 'rollback']);
    expect(audits).toEqual([]);
  });

  it('US-AD-03-T10 sets a fare through the Catalog and audits the fare it replaced', async () => {
    const catalog = new FakeCatalog();
    const { bus, audits } = fakeBus();

    const result = await bus.dispatch(
      new UpdateFare(catalog.api, FLIGHT_ID, 'ECONOMY', egp(1_700_000)),
      asAdmin(),
    );

    expect(result).toEqual({ ok: true, value: egp(1_700_000) });
    expect(catalog.fares).toEqual([
      { tx: TX, flightId: FLIGHT_ID, cabin: 'ECONOMY', fare: egp(1_700_000) },
    ]);
    expect(audits).toEqual([
      {
        actorId: asAdmin().principal!.id,
        action: 'UpdateFare',
        changes: [
          {
            target: `${FLIGHT_ID}/ECONOMY`,
            flightId: FLIGHT_ID,
            before: egp(1_500_000),
            after: egp(1_700_000),
          },
        ],
      },
    ]);
  });

  it('US-AD-03-T11 a fare the Catalog refuses is returned, rolled back and not audited', async () => {
    const catalog = new FakeCatalog();
    catalog.fareResult = err('CURRENCY_MISMATCH');
    const { bus, log, audits } = fakeBus();

    const result = await bus.dispatch(
      new UpdateFare(catalog.api, FLIGHT_ID, 'ECONOMY', { amountMinor: 1, currency: 'USD' }),
      asAdmin(),
    );

    expect(result).toEqual({ ok: false, error: 'CURRENCY_MISMATCH' });
    expect(log).toEqual(['begin', 'rollback']);
    expect(audits).toEqual([]);
  });
});
