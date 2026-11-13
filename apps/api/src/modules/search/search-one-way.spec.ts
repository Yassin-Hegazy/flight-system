import { describe, expect, it, vi } from 'vitest';
import { money } from '../../shared/money';
import { AirportCode, type FlightInfo, FlightStatus } from '../flight-catalog/index';
import { SearchOneWay } from './search-one-way';
import { ArrivalTimeSortStrategy } from './sorting/arrival-time-sort.strategy';
import { DepartureTimeSortStrategy } from './sorting/departure-time-sort.strategy';
import { DurationSortStrategy } from './sorting/duration-sort.strategy';
import { PriceSortStrategy } from './sorting/price-sort.strategy';
import { SortRegistry } from './sorting/sort-registry';
import {
  CAIRO,
  CatalogStub,
  criteria,
  fixedClock,
  flight,
  HEATHROW,
  InventoryStub,
  NOW,
} from './test-support';

const registry = () =>
  new SortRegistry([
    new PriceSortStrategy(),
    new DurationSortStrategy(),
    new DepartureTimeSortStrategy(),
    new ArrivalTimeSortStrategy(),
  ]);

interface Setup {
  flights?: FlightInfo[];
  seats?: Record<string, number>;
  defaultSeats?: number;
  now?: Date;
}

function searchWith({ flights = [], seats = {}, defaultSeats = 50, now = NOW }: Setup = {}) {
  const catalog = new CatalogStub(flights);
  const inventory = new InventoryStub(seats, defaultSeats);
  const search = new SearchOneWay(catalog, inventory, registry(), fixedClock(now));
  return { search, catalog, inventory };
}

const ids = (page: { items: { flightId: string }[] }) => page.items.map((item) => item.flightId);

async function expectOk<T>(
  promise: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
) {
  const outcome = await promise;
  if (!outcome.ok) throw new Error(`Expected ok, got ${String(outcome.error)}`);
  return outcome.value;
}

describe('US-FS-01 search one-way flights', () => {
  it('US-FS-01-T01 returns the bookable flights on the route that day, priced for the party', async () => {
    const ms777 = flight({ id: 'ms777', number: 'MS777', departs: '2026-12-10T07:00:00Z' });
    const ms779 = flight({ id: 'ms779', number: 'MS779', departs: '2026-12-10T15:00:00Z' });
    const { search } = searchWith({ flights: [ms777, ms779] });

    const page = await expectOk(search.execute(criteria({ passengers: { adults: 2 } })));

    expect(ids(page)).toEqual(['ms777', 'ms779']);
    expect(page.items[0].total).toEqual(money(20000, 'EGP'));
    expect(page.total).toBe(2);
  });

  it('US-FS-01-T02 flights in the other direction or on another local day are excluded', async () => {
    const right = flight({ id: 'right', departs: '2026-12-10T07:00:00Z' });
    const reverse = flight({
      id: 'reverse',
      origin: HEATHROW,
      destination: CAIRO,
      departs: '2026-12-10T07:00:00Z',
    });
    const nextDay = flight({ id: 'next-day', departs: '2026-12-11T07:00:00Z' });
    const { search, catalog } = searchWith({ flights: [right, reverse, nextDay] });
    const findFlights = vi.spyOn(catalog, 'findFlights');

    const page = await expectOk(search.execute(criteria()));

    expect(ids(page)).toEqual(['right']);
    const [route, date] = findFlights.mock.calls[0];
    expect([route.origin.value, route.destination.value, date]).toEqual([
      'CAI',
      'LHR',
      '2026-12-10',
    ]);
  });

  it('US-FS-01-T03 remaining seats equal to the seats needed is included, one fewer is excluded', async () => {
    // 2 adults + 1 child + 1 infant need 3 seats: the infant sits on a lap.
    const exact = flight({ id: 'exact', number: 'MS1', departs: '2026-12-10T07:00:00Z' });
    const short = flight({ id: 'short', number: 'MS2', departs: '2026-12-10T09:00:00Z' });
    const unprovisioned = flight({ id: 'none', number: 'MS3', departs: '2026-12-10T11:00:00Z' });
    const { search } = searchWith({
      flights: [exact, short, unprovisioned],
      seats: { exact: 3, short: 2 },
      defaultSeats: undefined,
    });

    const page = await expectOk(
      search.execute(criteria({ passengers: { adults: 2, children: 1, infants: 1 } })),
    );

    expect(ids(page)).toEqual(['exact']);
  });

  it('US-FS-01-T04 the same origin and destination is rejected, not answered with an empty list', async () => {
    const { search, catalog } = searchWith();
    const findFlights = vi.spyOn(catalog, 'findFlights');

    const outcome = await search.execute(criteria({ destination: AirportCode.of('CAI') }));

    expect(outcome).toEqual({ ok: false, error: 'SAME_AIRPORT' });
    expect(findFlights).not.toHaveBeenCalled();
  });

  it('US-FS-01-T05 yesterday in the origin zone is rejected, today is accepted', async () => {
    // NOW is 01:00 on 10 December in Cairo.
    const { search } = searchWith();

    expect(await search.execute(criteria({ date: '2026-12-09' }))).toEqual({
      ok: false,
      error: 'DATE_IN_PAST',
    });
    expect((await search.execute(criteria({ date: '2026-12-10' }))).ok).toBe(true);
  });

  it('US-FS-01-T06 cancelled, boarding and inside-the-cut-off flights are excluded', async () => {
    const flights = [
      flight({ id: 'cancelled', number: 'MS1', status: FlightStatus.Cancelled }),
      flight({ id: 'boarding', number: 'MS2', status: FlightStatus.Boarding }),
      // 2 h after NOW exactly: sales have closed.
      flight({ id: 'cut-off', number: 'MS3', departs: '2026-12-10T01:00:00Z' }),
      flight({ id: 'open', number: 'MS4', departs: '2026-12-10T01:01:00Z' }),
      flight({
        id: 'delayed',
        number: 'MS5',
        status: FlightStatus.Delayed,
        departs: '2026-12-10T08:00:00Z',
        estimated: '2026-12-10T10:00:00Z',
      }),
    ];
    const { search } = searchWith({ flights });

    const page = await expectOk(search.execute(criteria({ sort: 'DEPARTURE_TIME' })));

    expect(ids(page)).toEqual(['open', 'delayed']);
  });

  it('US-FS-01-T07 no matching flights is an empty page with total 0, not an error', async () => {
    const { search } = searchWith({ flights: [] });

    expect(await search.execute(criteria())).toEqual({
      ok: true,
      value: {
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        hasNext: false,
        sort: 'PRICE',
        filters: {},
      },
    });
  });

  it('US-FS-01-T08 passenger counts: 0 and 10 seated rejected, 1 and 9 accepted', async () => {
    const { search } = searchWith();
    const run = (adults: number, children = 0) =>
      search.execute(criteria({ passengers: { adults, children } }));

    expect(await run(0)).toEqual({ ok: false, error: 'INVALID_PASSENGERS' });
    expect((await run(1)).ok).toBe(true);
    expect((await run(5, 4)).ok).toBe(true);
    expect(await run(6, 4)).toEqual({ ok: false, error: 'INVALID_PASSENGERS' });
  });

  it('US-FS-01-T09 more infants than adults, or counts that are not whole numbers, are rejected', async () => {
    const { search } = searchWith();
    const invalid = { ok: false, error: 'INVALID_PASSENGERS' };

    expect(await search.execute(criteria({ passengers: { adults: 1, infants: 2 } }))).toEqual(
      invalid,
    );
    expect(await search.execute(criteria({ passengers: { adults: 1.5 } }))).toEqual(invalid);
    expect(await search.execute(criteria({ passengers: { adults: 2, children: -1 } }))).toEqual(
      invalid,
    );
    expect((await search.execute(criteria({ passengers: { adults: 2, infants: 2 } }))).ok).toBe(
      true,
    );
  });

  it('US-FS-01-T10 an unknown origin or destination airport is rejected', async () => {
    const { search } = searchWith();

    expect(await search.execute(criteria({ origin: AirportCode.of('XXX') }))).toEqual({
      ok: false,
      error: 'UNKNOWN_AIRPORT',
    });
    expect(await search.execute(criteria({ destination: AirportCode.of('YYY') }))).toEqual({
      ok: false,
      error: 'UNKNOWN_AIRPORT',
    });
  });

  it('US-FS-01-T11 a date that is not a real calendar date is rejected', async () => {
    const { search } = searchWith();
    expect(await search.execute(criteria({ date: '2026-02-30' }))).toEqual({
      ok: false,
      error: 'INVALID_DATE',
    });
  });

  it('US-FS-01-T12 a flight with no fare in the requested cabin is left out', async () => {
    const economyOnly = flight({ id: 'economy-only', fares: { ECONOMY: 10000 } });
    const both = flight({ id: 'both', number: 'MS779', departs: '2026-12-10T09:00:00Z' });
    const { search } = searchWith({ flights: [economyOnly, both] });

    const page = await expectOk(search.execute(criteria({ cabin: 'BUSINESS' })));

    expect(ids(page)).toEqual(['both']);
  });

  it('US-FS-01-T13 Inventory gets one request per bookable flight with the cabin and full party', async () => {
    const flights = [
      flight({ id: 'a', number: 'MS1', departs: '2026-12-10T07:00:00Z' }),
      flight({ id: 'b', number: 'MS2', status: FlightStatus.Cancelled }),
      flight({ id: 'c', number: 'MS3', departs: '2026-12-10T09:00:00Z' }),
    ];
    const { search, inventory } = searchWith({ flights });
    const check = vi.spyOn(inventory, 'checkAvailability');
    const passengers = { adults: 2, children: 1, infants: 1 };

    await search.execute(criteria({ cabin: 'BUSINESS', passengers }));

    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toEqual([
      { flightId: 'a', cabin: 'BUSINESS', passengers },
      { flightId: 'c', cabin: 'BUSINESS', passengers },
    ]);
  });

  it('US-FS-01-T14 the default sort is PRICE and the chosen key is echoed back', async () => {
    const dear = flight({ id: 'dear', number: 'MS1', fares: { ECONOMY: 30000 } });
    const cheap = flight({
      id: 'cheap',
      number: 'MS2',
      departs: '2026-12-10T12:00:00Z',
      fares: { ECONOMY: 10000 },
    });
    const { search } = searchWith({ flights: [dear, cheap] });

    const byPrice = await expectOk(search.execute(criteria()));
    const byDeparture = await expectOk(search.execute(criteria({ sort: 'DEPARTURE_TIME' })));

    expect([byPrice.sort, ...ids(byPrice)]).toEqual(['PRICE', 'cheap', 'dear']);
    expect([byDeparture.sort, ...ids(byDeparture)]).toEqual(['DEPARTURE_TIME', 'dear', 'cheap']);
  });
});

describe('US-FS-02 compare results through the pipeline', () => {
  it('US-FS-02-T11 an unsupported sort key is rejected before any query', async () => {
    const { search, catalog } = searchWith();
    const getAirports = vi.spyOn(catalog, 'getAirports');

    expect(await search.execute(criteria({ sort: 'CHEAPEST' }))).toEqual({
      ok: false,
      error: 'UNSUPPORTED_SORT',
    });
    expect(getAirports).not.toHaveBeenCalled();
  });
});

describe('US-FS-04 the party total shown in results', () => {
  it('US-FS-04-T08 2 adults and 1 child show two breakdown lines that add up to the total', async () => {
    const { search } = searchWith({ flights: [flight({ fares: { ECONOMY: 10000 } })] });

    const page = await expectOk(
      search.execute(criteria({ passengers: { adults: 2, children: 1 } })),
    );
    const [row] = page.items;

    expect(row.breakdown.map((line) => [line.passengerType, line.count])).toEqual([
      ['ADULT', 2],
      ['CHILD', 1],
    ]);
    expect(row.total).toEqual(money(27500, 'EGP'));
    expect(row.breakdown.reduce((sum, line) => sum + line.amount.amountMinor, 0)).toBe(
      row.total.amountMinor,
    );
  });

  it('US-FS-04-T09 the total is the Catalog quote, passed through untouched', async () => {
    const info = flight({ id: 'quoted' });
    const { search, catalog } = searchWith({ flights: [info] });
    const quote = {
      cabin: 'ECONOMY' as const,
      total: money(12345, 'EGP'),
      lines: [
        {
          passengerType: 'ADULT' as const,
          count: 1,
          unitPrice: money(12345, 'EGP'),
          amount: money(12345, 'EGP'),
        },
      ],
    };
    const priceParty = vi.spyOn(catalog, 'priceParty').mockReturnValue({ ok: true, value: quote });

    const page = await expectOk(search.execute(criteria()));

    expect(priceParty).toHaveBeenCalledWith(info, 'ECONOMY', { adults: 1 });
    expect(page.items[0].total).toBe(quote.total);
    expect(page.items[0].breakdown).toBe(quote.lines);
  });
});

describe('NFR-PERF-01 a fixed number of reads per search, whatever the number of flights', () => {
  it.each([0, 1, 50])(
    'NFR-PERF-01-T03 %i candidate flights: airports, flights and availability are each read once',
    async (count) => {
      const flights = Array.from({ length: count }, (_, i) =>
        flight({
          id: `f${i}`,
          number: `MS${100 + i}`,
          departs: new Date(Date.UTC(2026, 11, 10, 3, i)).toISOString(),
        }),
      );
      const { search, catalog, inventory } = searchWith({ flights });
      const getAirports = vi.spyOn(catalog, 'getAirports');
      const findFlights = vi.spyOn(catalog, 'findFlights');
      const check = vi.spyOn(inventory, 'checkAvailability');

      const page = await expectOk(search.execute(criteria({ pageSize: 50 })));

      expect(page.total).toBe(count);
      expect(getAirports).toHaveBeenCalledTimes(1);
      expect(findFlights).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledTimes(1);
      expect(check.mock.calls[0][0]).toHaveLength(count);
    },
  );
});

describe('NFR-DATA-02 "today" is the origin airport’s date', () => {
  it('NFR-DATA-02-T11 10 December is accepted while the UTC date is still 9 December', async () => {
    // NOW is 23:00 UTC on the 9th, 01:00 on the 10th in Cairo, 23:00 on the 9th in London.
    const { search } = searchWith({ now: NOW });
    expect((await search.execute(criteria({ date: '2026-12-10' }))).ok).toBe(true);
    // From London, whose clock still reads the 9th, the 9th is today and accepted.
    const fromLondon = criteria({
      origin: AirportCode.of('LHR'),
      destination: AirportCode.of('CAI'),
      date: '2026-12-09',
    });
    expect((await search.execute(fromLondon)).ok).toBe(true);
  });
});

describe('Search refuses nothing silently', () => {
  it('US-FS-01-T15 an Inventory refusal of a validated batch is a fault, not an empty result', async () => {
    const { search, inventory } = searchWith({ flights: [flight()] });
    vi.spyOn(inventory, 'checkAvailability').mockResolvedValue({
      ok: false,
      error: 'INVALID_REQUEST',
    });
    await expect(search.execute(criteria())).rejects.toThrow(/Inventory/);
  });
});
