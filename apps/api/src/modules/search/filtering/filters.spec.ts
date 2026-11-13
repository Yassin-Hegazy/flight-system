import { describe, expect, it } from 'vitest';
import { result } from '../test-support';
import { buildFilter, departsBetween, isValidFilters, maxTotal, operatedBy } from './filters';

const at = (time: string) => result({ departureLocal: `2026-12-10T${time}+02:00` });

describe('US-FS-03 each filter on its own (equivalence partitions)', () => {
  it('US-FS-03-T01 maxTotal keeps totals at or under the limit, departsBetween keeps the inclusive local window, operatedBy keeps the airline', () => {
    const limit = maxTotal(800000);
    expect(limit(result({ total: 799999 }))).toBe(true);
    expect(limit(result({ total: 800000 }))).toBe(true);
    expect(limit(result({ total: 800001 }))).toBe(false);

    const morning = departsBetween('06:00', '12:00');
    expect(morning(at('05:59'))).toBe(false);
    expect(morning(at('06:00'))).toBe(true);
    expect(morning(at('09:30'))).toBe(true);
    expect(morning(at('12:00'))).toBe(true);
    expect(morning(at('12:01'))).toBe(false);

    const egyptAir = operatedBy(['MS']);
    expect(egyptAir(result({ airline: 'MS' }))).toBe(true);
    expect(egyptAir(result({ airline: 'BA' }))).toBe(false);
  });

  it('US-FS-03-T08 the window uses the origin’s local clock, not UTC', () => {
    // 05:00 UTC is 07:00 in Cairo: inside 06:00-12:00 locally, outside it in UTC.
    const row = result({ departs: '2026-12-10T05:00Z', departureLocal: '2026-12-10T07:00+02:00' });
    expect(departsBetween('06:00', '12:00')(row)).toBe(true);
  });
});

describe('US-FS-03 filters combine with AND, airlines with OR', () => {
  // Decision table over price (under 8,000.00 EGP) and window (after 10:00).
  const filter = () =>
    buildFilter({ maxTotal: 800000, departureWindow: { from: '10:00', to: '23:59' } });
  const row = (total: number, time: string) =>
    result({ total, departureLocal: `2026-12-10T${time}+02:00` });

  it.each([
    ['cheap and late', 700000, '11:00', true],
    ['cheap and early', 700000, '09:00', false],
    ['dear and late', 900000, '11:00', false],
    ['dear and early', 900000, '09:00', false],
  ] as const)('US-FS-03-T02 %s → kept: %s', (_, total, time, kept) => {
    expect(filter()(row(total, time))).toBe(kept);
  });

  it('US-FS-03-T05 two airlines are OR’d: a flight by either one passes', () => {
    const either = buildFilter({ airlines: ['MS', 'BA'] });
    expect(either(result({ airline: 'MS' }))).toBe(true);
    expect(either(result({ airline: 'BA' }))).toBe(true);
    expect(either(result({ airline: 'LH' }))).toBe(false);
  });

  it('US-FS-03-T07 no filters, or an empty airline list, keep every result', () => {
    expect(buildFilter({})(result())).toBe(true);
    expect(buildFilter({ airlines: [] })(result({ airline: 'LH' }))).toBe(true);
  });
});

describe('US-FS-03 filter values are checked', () => {
  it('US-FS-03-T06 a window that ends before it starts, a bad time or a negative price is invalid', () => {
    expect(isValidFilters({ departureWindow: { from: '12:00', to: '06:00' } })).toBe(false);
    expect(isValidFilters({ departureWindow: { from: '24:00', to: '23:59' } })).toBe(false);
    expect(isValidFilters({ departureWindow: { from: '6:00', to: '12:00' } })).toBe(false);
    expect(isValidFilters({ maxTotal: -1 })).toBe(false);
    expect(isValidFilters({ maxTotal: 10.5 })).toBe(false);
    expect(isValidFilters({ airlines: ['EGYPTAIR'] })).toBe(false);

    expect(isValidFilters({ departureWindow: { from: '12:00', to: '12:00' } })).toBe(true);
    expect(isValidFilters({ maxTotal: 0, airlines: ['MS', 'u2'] })).toBe(true);
    expect(isValidFilters({})).toBe(true);
  });
});
