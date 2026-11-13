import { describe, expect, it } from 'vitest';
import { err } from '../../shared/result';
import { CreateFlight } from './create-flight.command';
import { FakeCatalog, FakeInventory, FLIGHT_ID, newFlight, TX } from './test-support';

function fixture(capacity = { ECONOMY: 180, BUSINESS: 20 }) {
  const catalog = new FakeCatalog();
  const inventory = new FakeInventory();
  const command = new CreateFlight(catalog.api, inventory.api, { flight: newFlight(), capacity });
  return { catalog, inventory, command };
}

describe('US-AD-01 Create a scheduled flight (command)', () => {
  it('US-AD-01-T08 creates the flight in the Catalog and both cabins in Inventory, in the same transaction', async () => {
    const { catalog, inventory, command } = fixture();

    const result = await command.execute(TX);

    expect(result).toEqual({ ok: true, value: { value: { id: FLIGHT_ID } } });
    expect(catalog.created).toEqual([{ tx: TX, flight: newFlight() }]);
    expect(inventory.capacities).toEqual([
      { tx: TX, flightId: FLIGHT_ID, cabin: 'ECONOMY', capacity: 180 },
      { tx: TX, flightId: FLIGHT_ID, cabin: 'BUSINESS', capacity: 20 },
    ]);
  });

  it("US-AD-01-T02 surfaces the Catalog's rule and gives the flight no seats", async () => {
    const { catalog, inventory, command } = fixture();
    catalog.createResult = err('DUPLICATE_FLIGHT');

    expect(await command.execute(TX)).toEqual({ ok: false, error: 'DUPLICATE_FLIGHT' });
    expect(inventory.capacities).toEqual([]);
  });

  it.each([
    { capacity: { ECONOMY: 0, BUSINESS: 0 }, accepted: false },
    { capacity: { ECONOMY: 1, BUSINESS: 0 }, accepted: true },
    { capacity: { ECONOMY: 0, BUSINESS: 1 }, accepted: true },
  ])(
    'US-AD-01-T03 capacity $capacity: at least one cabin needs a seat',
    async ({ capacity, accepted }) => {
      const { catalog, command } = fixture(capacity);

      const result = await command.execute(TX);

      expect(result.ok).toBe(accepted);
      if (!result.ok) expect(result.error).toBe('NO_SEATS');
      // Checked before anything is written.
      expect(catalog.created).toHaveLength(accepted ? 1 : 0);
    },
  );

  it('US-AD-01-T09 a capacity Inventory refuses for a new flight is a fault, not a business result', async () => {
    const { inventory, command } = fixture();
    inventory.capacityResult = err('FLIGHT_NOT_FOUND');

    await expect(command.execute(TX)).rejects.toThrow('FLIGHT_NOT_FOUND');
  });
});
