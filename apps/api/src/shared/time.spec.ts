import { describe, expect, it } from 'vitest';
import { formatLocal, isLocalDate, isValidTimeZone, localDayToUtcRange } from './time';

describe('NFR-DATA-02 UTC storage, airport-local behaviour', () => {
  it('NFR-DATA-02-T01 shows an instant in the airport time zone with its UTC offset', () => {
    const departure = new Date('2026-12-10T07:00:00Z');
    expect(formatLocal(departure, 'Africa/Cairo')).toBe('2026-12-10T09:00+02:00');
    expect(formatLocal(new Date('2026-12-10T12:00:00Z'), 'Europe/London')).toBe(
      '2026-12-10T12:00+00:00',
    );
  });

  it('NFR-DATA-02-T02 turns a local calendar day into the matching UTC range', () => {
    expect(localDayToUtcRange('2026-12-10', 'Africa/Cairo')).toEqual({
      start: new Date('2026-12-09T22:00:00Z'),
      end: new Date('2026-12-10T22:00:00Z'),
    });
  });

  it('NFR-DATA-02-T03 gives a 23-hour day on the date clocks go forward (London)', () => {
    const { start, end } = localDayToUtcRange('2026-03-29', 'Europe/London');
    expect(start).toEqual(new Date('2026-03-29T00:00:00Z'));
    expect(end).toEqual(new Date('2026-03-29T23:00:00Z'));
  });

  it('NFR-DATA-02-T04 starts the day at the first real instant when midnight is skipped (Cairo DST)', () => {
    // Egypt moves clocks from 00:00 to 01:00 on the last Friday of April.
    const { start, end } = localDayToUtcRange('2026-04-24', 'Africa/Cairo');
    expect(start).toEqual(new Date('2026-04-23T22:00:00Z'));
    expect(end).toEqual(new Date('2026-04-24T21:00:00Z'));
    expect(formatLocal(start, 'Africa/Cairo')).toBe('2026-04-24T01:00+03:00');
  });

  it('NFR-DATA-02-T05 accepts IANA time zones and rejects unknown ones', () => {
    expect(isValidTimeZone('Africa/Cairo')).toBe(true);
    expect(isValidTimeZone('Cairo/Egypt')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('NFR-DATA-02-T06 accepts only real calendar dates written as YYYY-MM-DD', () => {
    expect(isLocalDate('2026-12-10')).toBe(true);
    expect(isLocalDate('2026-12-10T05:00:00Z')).toBe(false);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('10-12-2026')).toBe(false);
  });
});
