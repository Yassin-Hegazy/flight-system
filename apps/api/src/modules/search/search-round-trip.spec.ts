import { describe, expect, it } from 'vitest';
import { AirportCode } from '../flight-catalog/index';
import type { RoundTripCriteria } from './search-api';
import { SearchRoundTrip } from './search-round-trip';
import { CAIRO, expectOk, flight, HEATHROW, ids, searchWith } from './test-support';

const roundTrip = (overrides: Partial<RoundTripCriteria> = {}): RoundTripCriteria => ({
  origin: AirportCode.of('CAI'),
  destination: AirportCode.of('LHR'),
  date: '2026-12-10',
  returnDate: '2026-12-17',
  passengers: { adults: 1 },
  cabin: 'ECONOMY',
  ...overrides,
});

const back = (id: string, departs: string, fare: number) =>
  flight({
    id,
    number: `BA${id.length}${fare}`.slice(0, 6),
    origin: HEATHROW,
    destination: CAIRO,
    departs,
    fares: { ECONOMY: fare },
  });

function tripSearch() {
  const flights = [
    flight({
      id: 'out-cheap-late',
      number: 'MS1',
      departs: '2026-12-10T15:00:00Z',
      fares: { ECONOMY: 10000 },
    }),
    flight({
      id: 'out-dear-early',
      number: 'MS2',
      departs: '2026-12-10T06:00:00Z',
      fares: { ECONOMY: 30000 },
    }),
    back('in-cheap-late', '2026-12-17T18:00:00Z', 11000),
    back('in-dear-early', '2026-12-17T07:00:00Z', 31000),
  ];
  const { search } = searchWith({ flights });
  return new SearchRoundTrip(search);
}

describe('US-FS-06 search round trips', () => {
  it('US-FS-06-T01 a return one day before the outbound is rejected; the same day is accepted', async () => {
    const search = tripSearch();

    expect(await search.execute(roundTrip({ returnDate: '2026-12-09' }))).toEqual({
      ok: false,
      error: 'RETURN_BEFORE_OUTBOUND',
    });
    expect((await search.execute(roundTrip({ returnDate: '2026-12-10' }))).ok).toBe(true);
  });

  it('US-FS-06-T02 sorting the return list leaves the outbound list unchanged', async () => {
    const search = tripSearch();

    const byPrice = await expectOk(search.execute(roundTrip()));
    const inboundByTime = await expectOk(
      search.execute(roundTrip({ inboundSort: 'DEPARTURE_TIME' })),
    );

    expect(inboundByTime.outbound).toEqual(byPrice.outbound);
    expect(ids(byPrice.outbound)).toEqual(['out-cheap-late', 'out-dear-early']);
    expect(ids(byPrice.inbound)).toEqual(['in-cheap-late', 'in-dear-early']);
    expect(ids(inboundByTime.inbound)).toEqual(['in-dear-early', 'in-cheap-late']);
    expect([inboundByTime.outbound.sort, inboundByTime.inbound.sort]).toEqual([
      'PRICE',
      'DEPARTURE_TIME',
    ]);
  });

  it('US-FS-06-T04 the return leg flies the reverse route on the return date', async () => {
    const outcome = await expectOk(tripSearch().execute(roundTrip()));

    expect(outcome.inbound.items.every((r) => r.origin.code === 'LHR')).toBe(true);
    expect(outcome.inbound.items.every((r) => r.departureLocal.startsWith('2026-12-17'))).toBe(
      true,
    );
    expect(outcome.outbound.items.every((r) => r.origin.code === 'CAI')).toBe(true);
  });

  it('US-FS-06-T05 each leg has its own page; filters and page size apply to both', async () => {
    const search = tripSearch();

    const outcome = await expectOk(
      search.execute(
        roundTrip({ pageSize: 1, outboundPage: 2, inboundPage: 1, filters: { maxTotal: 40000 } }),
      ),
    );

    expect(ids(outcome.outbound)).toEqual(['out-dear-early']);
    expect(ids(outcome.inbound)).toEqual(['in-cheap-late']);
    expect([outcome.outbound.pageSize, outcome.inbound.pageSize]).toEqual([1, 1]);
    expect(outcome.inbound.filters).toEqual({ maxTotal: 40000 });
  });

  it('US-FS-06-T06 a leg’s validation error is reported, and a return date must be a real date', async () => {
    const search = tripSearch();

    expect(await search.execute(roundTrip({ destination: AirportCode.of('CAI') }))).toEqual({
      ok: false,
      error: 'SAME_AIRPORT',
    });
    expect(await search.execute(roundTrip({ returnDate: '2026-12-32' }))).toEqual({
      ok: false,
      error: 'INVALID_DATE',
    });
    expect(await search.execute(roundTrip({ inboundSort: 'CHEAPEST' }))).toEqual({
      ok: false,
      error: 'UNSUPPORTED_SORT',
    });
  });
});
