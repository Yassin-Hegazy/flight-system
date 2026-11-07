import { describe, expect, it } from 'vitest';
import { formatLocal } from '../../shared/time';
import type { FlightInfo } from './catalog-api';
import { isBookable } from './flight';
import { FlightStatus, canTransition, parseFlightStatus } from './flight-status';
import { priceParty } from './pricing';
import { AirportCode } from './value-objects';

const flight = (status: FlightStatus): FlightInfo => ({
  id: 'flight-1',
  flightNumber: 'MS-001',
  airline: { code: 'MS', name: 'EgyptAir' },
  origin: { code: 'CAI', name: 'Cairo International', city: 'Cairo', timezone: 'Africa/Cairo' },
  destination: { code: 'LHR', name: 'Heathrow', city: 'London', timezone: 'Europe/London' },
  scheduledDepartureUtc: new Date('2026-12-10T07:00:00Z'),
  scheduledArrivalUtc: new Date('2026-12-10T12:00:00Z'),
  scheduledDepartureLocal: '2026-12-10T09:00 GMT+2',
  scheduledArrivalLocal: '2026-12-10T12:00 GMT',
  durationMinutes: 300,
  status,
  fares: { ECONOMY: { amount: 100, currency: 'USD' } },
});

describe('flight catalog domain', () => {
  it('normalizes and validates airport codes', () => {
    expect(AirportCode.of(' cai ').value).toBe('CAI');
    expect(() => AirportCode.of('CAIRO')).toThrow();
  });

  it('enforces the status state machine', () => {
    expect(canTransition(parseFlightStatus('scheduled'), FlightStatus.Delayed)).toBe(true);
    expect(canTransition(FlightStatus.Departed, FlightStatus.Cancelled)).toBe(false);
    expect(() => parseFlightStatus('LANDED')).toThrow();
  });

  it('formats the Cairo-London example using airport time zones', () => {
    const departure = formatLocal(
      flight(FlightStatus.Scheduled).scheduledDepartureUtc,
      'Africa/Cairo',
    );
    const arrival = formatLocal(
      flight(FlightStatus.Scheduled).scheduledArrivalUtc,
      'Europe/London',
    );
    expect(departure).toContain('09:00');
    expect(arrival).toContain('12:00');
    expect(flight(FlightStatus.Scheduled).durationMinutes).toBe(300);
  });

  it('only considers future non-terminal flights bookable', () => {
    expect(isBookable(flight(FlightStatus.Scheduled), new Date('2026-01-01T00:00:00Z'))).toBe(true);
    expect(isBookable(flight(FlightStatus.Cancelled), new Date('2026-01-01T00:00:00Z'))).toBe(
      false,
    );
  });

  it('calculates the same party total for consumers', () => {
    expect(
      priceParty(flight(FlightStatus.Scheduled), 'ECONOMY', { adults: 2, children: 1 }).total,
    ).toBe(300);
  });
});
