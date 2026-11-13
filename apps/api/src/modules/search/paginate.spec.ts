import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE, pageRequest, paginate } from './paginate';
import { criteria, expectOk, flight, searchWith, seededRandom } from './test-support';

describe('US-FS-05 page size and number (BVA)', () => {
  it.each([
    [1, 1],
    [20, 20],
    [50, 50],
    [51, 50],
    [100_000, 50],
  ])('US-FS-05-T01 a page size of %i gives pages of %i', (requested, size) => {
    expect(pageRequest(1, requested)).toEqual({ ok: true, value: { page: 1, pageSize: size } });
  });

  it('US-FS-05-T04 the default is page 1 of 20; size or page below 1, or fractional, is rejected', () => {
    expect(pageRequest()).toEqual({ ok: true, value: { page: 1, pageSize: 20 } });
    expect(pageRequest(1, 0)).toEqual({ ok: false, error: 'INVALID_PAGE_SIZE' });
    expect(pageRequest(1, -5)).toEqual({ ok: false, error: 'INVALID_PAGE_SIZE' });
    expect(pageRequest(1, 2.5)).toEqual({ ok: false, error: 'INVALID_PAGE_SIZE' });
    expect(pageRequest(0, 20)).toEqual({ ok: false, error: 'INVALID_PAGE' });
    expect(pageRequest(1.5, 20)).toEqual({ ok: false, error: 'INVALID_PAGE' });
    expect(MAX_PAGE_SIZE).toBe(50);
  });
});

describe('US-FS-05 page metadata', () => {
  const letters = [...'abcdefghijklmnopqrstuvwxy']; // 25 items

  it('US-FS-05-T03 each page reports the total and whether a next page exists', () => {
    expect(paginate(letters, { page: 1, pageSize: 10 })).toMatchObject({
      total: 25,
      hasNext: true,
      page: 1,
      pageSize: 10,
    });
    expect(paginate(letters, { page: 3, pageSize: 10 })).toMatchObject({
      items: [...'uvwxy'],
      total: 25,
      hasNext: false,
    });
    // Exactly full: no next page.
    expect(paginate(letters.slice(0, 20), { page: 2, pageSize: 10 }).hasNext).toBe(false);
    // Past the end: empty, still the total.
    expect(paginate(letters, { page: 4, pageSize: 10 })).toMatchObject({
      items: [],
      total: 25,
      hasNext: false,
    });
  });
});

describe('US-FS-05 pages through the pipeline', () => {
  const manyFlights = () => {
    const random = seededRandom(5);
    return Array.from({ length: 47 }, (_, i) =>
      flight({
        id: `f${i}`,
        number: `MS${100 + i}`,
        // Few distinct prices and times, so the tie-break decides most of the order.
        departs: new Date(Date.UTC(2026, 11, 10, 4 + Math.floor(random() * 4))).toISOString(),
        durationMinutes: 240 + Math.floor(random() * 3) * 15,
        fares: { ECONOMY: 10000 + Math.floor(random() * 3) * 1000 },
      }),
    );
  };

  it.each(['PRICE', 'DURATION', 'DEPARTURE_TIME', 'ARRIVAL_TIME'])(
    'US-FS-05-T02 under %s, concatenated pages equal the full sorted list: no duplicates, no gaps',
    async (sort) => {
      const { search } = searchWith({ flights: manyFlights() });
      const full = await expectOk(search.execute(criteria({ sort, pageSize: 50 })));

      const pages = [];
      for (let page = 1; page <= 5; page += 1) {
        pages.push(await expectOk(search.execute(criteria({ sort, page, pageSize: 10 }))));
      }

      expect(pages.flatMap((p) => p.items.map((r) => r.flightId))).toEqual(
        full.items.map((r) => r.flightId),
      );
      expect(pages.map((p) => p.hasNext)).toEqual([true, true, true, true, false]);
      expect(full.total).toBe(47);
    },
  );

  it('US-FS-05-T05 a search asking for 51 per page gets 50; page 0 is rejected', async () => {
    const { search } = searchWith({ flights: manyFlights() });

    const capped = await expectOk(search.execute(criteria({ pageSize: 51 })));
    expect([capped.pageSize, capped.items.length, capped.hasNext]).toEqual([50, 47, false]);
    expect(await search.execute(criteria({ page: 0 }))).toEqual({
      ok: false,
      error: 'INVALID_PAGE',
    });
    expect(await search.execute(criteria({ pageSize: 0 }))).toEqual({
      ok: false,
      error: 'INVALID_PAGE_SIZE',
    });
  });
});
