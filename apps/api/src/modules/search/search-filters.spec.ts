import { describe, expect, it } from 'vitest';
import { criteria, expectOk, flight, ids, searchWith } from './test-support';

/** 30 flights on 10 December, every 20 minutes from 05:00 UTC; the first 25 cost 5,000.00. */
const thirtyFlights = () =>
  Array.from({ length: 30 }, (_, i) =>
    flight({
      id: `f${String(i).padStart(2, '0')}`,
      number: `MS${100 + i}`,
      departs: new Date(Date.UTC(2026, 11, 10, 5, i * 20)).toISOString(),
      fares: { ECONOMY: i < 25 ? 500000 : 900000 },
    }),
  );

describe('US-FS-03 filters run before sorting and paging', () => {
  it('US-FS-03-T03 30 flights, 25 pass: total 25, page 1 has 20, page 2 has 5', async () => {
    const { search } = searchWith({ flights: thirtyFlights() });
    const filters = { maxTotal: 800000 };

    const first = await expectOk(search.execute(criteria({ filters, page: 1 })));
    const second = await expectOk(search.execute(criteria({ filters, page: 2 })));

    expect([first.total, first.items.length, first.hasNext]).toEqual([25, 20, true]);
    expect([second.total, second.items.length, second.hasNext]).toEqual([25, 5, false]);
  });

  it('US-FS-03-T04 filters that exclude everything give an empty page with the filters echoed', async () => {
    const { search } = searchWith({ flights: thirtyFlights() });
    const filters = {
      maxTotal: 100,
      departureWindow: { from: '06:00', to: '07:00' },
      airlines: ['BA'],
    };

    const page = await expectOk(search.execute(criteria({ filters })));

    expect(page).toMatchObject({ items: [], total: 0, hasNext: false, filters });
  });

  it('US-FS-03-T09 an invalid filter is rejected before any query', async () => {
    const { search } = searchWith({ flights: thirtyFlights() });

    expect(
      await search.execute(
        criteria({ filters: { departureWindow: { from: '12:00', to: '06:00' } } }),
      ),
    ).toEqual({ ok: false, error: 'INVALID_FILTER' });
  });

  it('US-FS-03-T10 airline filters match the airline code, and combine with the window', async () => {
    const flights = [
      flight({ id: 'ms-early', number: 'MS1', departs: '2026-12-10T04:00:00Z' }), // 06:00 Cairo
      flight({ id: 'ba-early', number: 'BA1', departs: '2026-12-10T05:00:00Z' }), // 07:00 Cairo
      flight({ id: 'lh-early', number: 'LH1', departs: '2026-12-10T05:30:00Z' }), // 07:30 Cairo
      flight({ id: 'ms-late', number: 'MS2', departs: '2026-12-10T12:00:00Z' }), // 14:00 Cairo
    ];
    const { search } = searchWith({ flights });

    const page = await expectOk(
      search.execute(
        criteria({
          sort: 'DEPARTURE_TIME',
          filters: { airlines: ['MS', 'BA'], departureWindow: { from: '06:00', to: '12:00' } },
        }),
      ),
    );

    expect(ids(page)).toEqual(['ms-early', 'ba-early']);
  });
});
