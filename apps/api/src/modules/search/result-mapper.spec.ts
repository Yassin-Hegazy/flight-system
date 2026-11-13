import { describe, expect, it } from 'vitest';
import { money } from '../../shared/money';
import { FlightStatus, type PriceQuote } from '../flight-catalog/index';
import { toSearchResult } from './result-mapper';
import { CAIRO, flight, HEATHROW } from './test-support';

const quote: PriceQuote = {
  cabin: 'ECONOMY',
  total: money(17500, 'EGP'),
  lines: [
    {
      passengerType: 'ADULT',
      count: 1,
      unitPrice: money(10000, 'EGP'),
      amount: money(10000, 'EGP'),
    },
    { passengerType: 'CHILD', count: 1, unitPrice: money(7500, 'EGP'), amount: money(7500, 'EGP') },
  ],
};

describe('US-FS-02 every result carries the comparison fields', () => {
  it('US-FS-02-T01 the mapper fills every field from the flight and the quote', () => {
    const info = flight({
      id: 'f1',
      number: 'MS777',
      airlineName: 'EgyptAir',
      departs: '2026-12-10T07:00:00Z',
      durationMinutes: 330,
    });

    expect(toSearchResult(info, quote)).toEqual({
      flightId: 'f1',
      flightNumber: 'MS777',
      airline: { code: 'MS', name: 'EgyptAir' },
      origin: CAIRO,
      destination: HEATHROW,
      departureLocal: '2026-12-10T09:00+02:00',
      arrivalLocal: '2026-12-10T12:30+00:00',
      departureUtc: new Date('2026-12-10T07:00:00Z'),
      arrivalUtc: new Date('2026-12-10T12:30:00Z'),
      status: FlightStatus.Scheduled,
      durationMinutes: 330,
      stops: 0,
      cabin: 'ECONOMY',
      adultFare: money(10000, 'EGP'),
      total: money(17500, 'EGP'),
      breakdown: quote.lines,
    });
  });

  it('US-FS-02-T12 a delayed flight keeps its scheduled time and shows the estimate beside it', () => {
    const info = flight({
      status: FlightStatus.Delayed,
      departs: '2026-12-10T07:00:00Z',
      estimated: '2026-12-10T08:30:00Z',
    });

    const row = toSearchResult(info, quote);

    expect(row.departureLocal).toBe('2026-12-10T09:00+02:00');
    expect(row.estimatedDepartureLocal).toBe('2026-12-10T10:30+02:00');
    expect(row.estimatedDepartureUtc).toEqual(new Date('2026-12-10T08:30:00Z'));
    expect(row.status).toBe(FlightStatus.Delayed);
  });
});
