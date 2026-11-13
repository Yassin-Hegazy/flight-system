import { describe, expect, it } from 'vitest';
import type { Tx } from '../../shared/db';
import { err, ok } from '../../shared/result';
import type { RecurringFlightBody } from './operations.dto';
import { ScheduleRecurring } from './schedule-recurring.command';
import { FakeCatalog, FakeInventory } from './test-support';

/** ScheduleRecurring runs each date under a savepoint, so the transaction needs a query runner. */
const TX_WITH_SAVEPOINTS = {
  queryRunner: {
    startTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
  },
} as unknown as Tx;

function series(fields: Partial<RecurringFlightBody> = {}): RecurringFlightBody {
  return {
    template: {
      flightNumber: 'MS777',
      airlineCode: 'MS',
      originCode: 'CAI',
      destinationCode: 'LHR',
      currency: 'EGP',
      fares: { ECONOMY: 1_500_000, BUSINESS: 4_500_000 },
      capacity: { ECONOMY: 180, BUSINESS: 20 },
    },
    // Egypt moves its clocks forward on the last Friday of April: 30 April 2027.
    from: '2027-04-26',
    to: '2027-05-03',
    weekdays: [1],
    localDeparture: '09:00',
    durationMinutes: 300,
    ...fields,
  };
}

function fixture(body = series()) {
  const catalog = new FakeCatalog();
  const inventory = new FakeInventory();
  const command = new ScheduleRecurring(catalog.api, inventory.api, body);
  return { catalog, inventory, command };
}

describe('US-AD-08 Schedule recurring flights (command)', () => {
  it("US-AD-08-T03 one flight per chosen weekday, 09:00 Cairo time on both sides of Egypt's DST change", async () => {
    const { catalog, command } = fixture();
    catalog.createResults = [ok('f-1'), ok('f-2')];

    const result = await command.execute(TX_WITH_SAVEPOINTS);

    expect(catalog.created.map(({ flight }) => flight.scheduledDepartureUtc.toISOString())).toEqual(
      [
        '2027-04-26T07:00:00.000Z', // EET, UTC+2
        '2027-05-03T06:00:00.000Z', // EEST, UTC+3
      ],
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        value: {
          flights: [
            { date: '2027-04-26', id: 'f-1' },
            { date: '2027-05-03', id: 'f-2' },
          ],
        },
      },
    });
    if (result.ok) expect(result.value.audit).toHaveLength(2);
  });

  it('US-AD-08-T04 one failing date rejects the whole series and names each failing date', async () => {
    const { catalog, command } = fixture(series({ to: '2027-05-10' }));
    catalog.createResults = [ok('f-1'), err('DUPLICATE_FLIGHT'), ok('f-3')];

    const result = await command.execute(TX_WITH_SAVEPOINTS);

    expect(result).toEqual({
      ok: false,
      error: { code: 'SERIES_REJECTED', dates: { '2027-05-03': 'DUPLICATE_FLIGHT' } },
    });
  });

  it('US-AD-08-T05 a range over 90 days, or with no chosen weekday in it, creates nothing', async () => {
    const tooLong = fixture(series({ from: '2027-01-01', to: '2027-04-02' }));
    const noMatch = fixture(series({ from: '2027-04-27', to: '2027-04-28' }));

    expect(await tooLong.command.execute(TX_WITH_SAVEPOINTS)).toEqual({
      ok: false,
      error: { code: 'INVALID_DATE_RANGE' },
    });
    expect(await noMatch.command.execute(TX_WITH_SAVEPOINTS)).toEqual({
      ok: false,
      error: { code: 'NO_MATCHING_DATES' },
    });
    expect([...tooLong.catalog.created, ...noMatch.catalog.created]).toEqual([]);
  });
});
