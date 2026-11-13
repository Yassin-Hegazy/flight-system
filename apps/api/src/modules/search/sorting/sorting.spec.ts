import { describe, expect, it } from 'vitest';
import { result, seededRandom } from '../test-support';
import { ArrivalTimeSortStrategy } from './arrival-time-sort.strategy';
import { DepartureTimeSortStrategy } from './departure-time-sort.strategy';
import { DurationSortStrategy } from './duration-sort.strategy';
import { PriceSortStrategy } from './price-sort.strategy';
import { SortRegistry } from './sort-registry';
import type { SortStrategy } from './sort-strategy';

const ALL: SortStrategy[] = [
  new PriceSortStrategy(),
  new DurationSortStrategy(),
  new DepartureTimeSortStrategy(),
  new ArrivalTimeSortStrategy(),
];

const numbers = (list: ReturnType<typeof result>[]) => list.map((r) => r.flightNumber);

describe('US-FS-02 compare results: each sort strategy', () => {
  it('US-FS-02-T04 price sort breaks ties by departure time, then flight number', () => {
    // Pack section 8: the tie case a naive implementation gets wrong.
    const a = result({ flight: 'MS779', total: 9000, departs: '2026-12-10T09:00Z' });
    const b = result({ flight: 'MS777', total: 9000, departs: '2026-12-10T09:00Z' });
    const c = result({ flight: 'BA155', total: 8000, departs: '2026-12-10T15:00Z' });

    expect(numbers([a, b, c].sort((x, y) => new PriceSortStrategy().compare(x, y)))).toEqual([
      'BA155',
      'MS777',
      'MS779',
    ]);
  });

  it('US-FS-02-T05 price sort puts the cheapest party total first', () => {
    const list = [
      result({ flight: 'MS1', total: 30000 }),
      result({ flight: 'MS2', total: 10000 }),
      result({ flight: 'MS3', total: 20000 }),
    ];
    expect(numbers(list.sort((x, y) => new PriceSortStrategy().compare(x, y)))).toEqual([
      'MS2',
      'MS3',
      'MS1',
    ]);
  });

  it('US-FS-02-T06 duration sort puts the shortest flight first, ties by departure', () => {
    const list = [
      result({ flight: 'MS1', durationMinutes: 320 }),
      result({ flight: 'MS2', durationMinutes: 290, departs: '2026-12-10T12:00Z' }),
      result({ flight: 'MS3', durationMinutes: 290, departs: '2026-12-10T08:00Z' }),
    ];
    expect(numbers(list.sort((x, y) => new DurationSortStrategy().compare(x, y)))).toEqual([
      'MS3',
      'MS2',
      'MS1',
    ]);
  });

  it('US-FS-02-T07 departure-time sort orders by the UTC instant, ties by flight number', () => {
    const list = [
      result({ flight: 'MS9', departs: '2026-12-10T09:00Z' }),
      result({ flight: 'MS8', departs: '2026-12-10T06:00Z' }),
      result({ flight: 'BA1', departs: '2026-12-10T09:00Z' }),
    ];
    expect(numbers(list.sort((x, y) => new DepartureTimeSortStrategy().compare(x, y)))).toEqual([
      'MS8',
      'BA1',
      'MS9',
    ]);
  });

  it('US-FS-02-T08 arrival-time sort orders by the arrival instant, not the departure', () => {
    const list = [
      // Leaves first but lands last.
      result({ flight: 'MS1', departs: '2026-12-10T06:00Z', durationMinutes: 600 }),
      result({ flight: 'MS2', departs: '2026-12-10T08:00Z', durationMinutes: 240 }),
      result({ flight: 'MS3', departs: '2026-12-10T07:00Z', durationMinutes: 300 }),
    ];
    // Arrivals: MS1 16:00, MS2 12:00, MS3 12:00 (tie: MS3 departs first).
    expect(numbers(list.sort((x, y) => new ArrivalTimeSortStrategy().compare(x, y)))).toEqual([
      'MS3',
      'MS2',
      'MS1',
    ]);
  });

  it('US-FS-02-T09 every strategy gives the same order whatever the input order', () => {
    const list = [
      result({ flight: 'MS2', total: 9000, departs: '2026-12-10T09:00Z' }),
      result({ flight: 'MS1', total: 9000, departs: '2026-12-10T09:00Z' }),
      result({ flight: 'MS3', total: 9000, departs: '2026-12-10T09:00Z' }),
    ];
    for (const strategy of ALL) {
      const forward = numbers([...list].sort((x, y) => strategy.compare(x, y)));
      const backward = numbers([...list].reverse().sort((x, y) => strategy.compare(x, y)));
      expect(backward, strategy.key).toEqual(forward);
      expect(forward, strategy.key).toEqual(['MS1', 'MS2', 'MS3']);
    }
  });
});

describe('US-FS-02 sorting never changes the matching set', () => {
  it('US-FS-02-T02 the set of IDs is identical under all four sorts (random inputs)', () => {
    const random = seededRandom(20261210);
    for (let run = 0; run < 100; run += 1) {
      const size = Math.floor(random() * 25);
      const list = Array.from({ length: size }, (_, i) =>
        result({
          flight: `MS${100 + i}`,
          total: 5000 + Math.floor(random() * 5) * 1000, // many equal prices
          durationMinutes: 200 + Math.floor(random() * 4) * 30,
          departs: new Date(Date.UTC(2026, 11, 10, Math.floor(random() * 6))).toISOString(),
        }),
      );
      const expected = list.map((r) => r.flightId).sort();
      for (const strategy of ALL) {
        const sorted = [...list].sort((x, y) => strategy.compare(x, y));
        expect(sorted.map((r) => r.flightId).sort(), strategy.key).toEqual(expected);
      }
    }
  });
});

describe('US-FS-02 the registry is how unsupported sorts are rejected', () => {
  it('US-FS-02-T03 an unknown key such as CHEAPEST has no strategy', () => {
    const registry = new SortRegistry(ALL);
    expect(registry.get('CHEAPEST')).toBeUndefined();
    expect(registry.get('price')).toBeUndefined();
  });

  it('US-FS-02-T10 the registry finds each strategy by key and lists the four keys', () => {
    const registry = new SortRegistry(ALL);
    expect(registry.keys()).toEqual(['PRICE', 'DURATION', 'DEPARTURE_TIME', 'ARRIVAL_TIME']);
    for (const strategy of ALL) expect(registry.get(strategy.key)).toBe(strategy);
  });
});
