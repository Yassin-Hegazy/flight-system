import { describe, expect, it } from 'vitest';
import { type BookabilityView, isBookable } from './flight';
import { FlightStatus } from './flight-status';

// Overview section 4.2: bookable only while SCHEDULED or DELAYED and more than 2 hours before
// departure, measured from the estimated departure when the flight is delayed.
const DEPARTURE = new Date('2026-12-10T07:00:00Z');

const flight = (overrides: Partial<BookabilityView> = {}): BookabilityView => ({
  status: FlightStatus.Scheduled,
  scheduledDepartureUtc: DEPARTURE,
  estimatedDepartureUtc: null,
  ...overrides,
});

const before = (minutes: number, departure = DEPARTURE) =>
  new Date(departure.getTime() - minutes * 60_000);

describe('Overview 4.2 bookable flights (isBookable, used by US-FS and US-BK stories)', () => {
  it('US-FL-02-T05 boundary: 2 h 01 min before is bookable; exactly 2 h and 1 h 59 min are not', () => {
    expect(isBookable(flight(), before(121))).toBe(true);
    expect(isBookable(flight(), before(120))).toBe(false);
    expect(isBookable(flight(), before(119))).toBe(false);
  });

  it('US-FL-02-T06 only SCHEDULED and DELAYED flights can be bookable', () => {
    const farAhead = before(24 * 60);
    expect(isBookable(flight({ status: FlightStatus.Scheduled }), farAhead)).toBe(true);
    expect(
      isBookable(
        flight({
          status: FlightStatus.Delayed,
          estimatedDepartureUtc: new Date('2026-12-10T08:00:00Z'),
        }),
        farAhead,
      ),
    ).toBe(true);
    for (const status of [
      FlightStatus.Boarding,
      FlightStatus.Departed,
      FlightStatus.Arrived,
      FlightStatus.Cancelled,
    ]) {
      expect(isBookable(flight({ status }), farAhead)).toBe(false);
    }
  });

  it('US-FL-02-T07 a delayed flight is judged against its estimated departure', () => {
    const estimated = new Date('2026-12-10T09:00:00Z');
    const delayed = flight({ status: FlightStatus.Delayed, estimatedDepartureUtc: estimated });
    // 2 h 30 min before the new time but only 30 min before the original time: still bookable.
    expect(isBookable(delayed, before(150, estimated))).toBe(true);
    // 1 h 30 min before the new time: no longer bookable.
    expect(isBookable(delayed, before(90, estimated))).toBe(false);
  });
});
