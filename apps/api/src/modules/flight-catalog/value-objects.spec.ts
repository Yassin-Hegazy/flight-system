import { describe, expect, it } from 'vitest';
import { Flight, type NewFlight } from './flight';
import {
  AirportCode,
  FlightNumber,
  InvalidAirportCode,
  InvalidFlightNumber,
} from './value-objects';

const NOW = new Date('2026-11-01T00:00:00Z');

const newFlight = (overrides: Partial<NewFlight>): NewFlight => ({
  flightNumber: 'MS777',
  airlineCode: 'MS',
  originCode: 'CAI',
  destinationCode: 'LHR',
  scheduledDepartureUtc: new Date('2026-12-10T07:00:00Z'),
  scheduledArrivalUtc: new Date('2026-12-10T12:00:00Z'),
  ...overrides,
});

describe('US-AD-01 flight numbers (overview 4.5: 2-character airline code + 1 to 4 digits)', () => {
  it('US-AD-01-T04 accepts valid flight numbers and normalises case and spaces', () => {
    expect(FlightNumber.of('MS777').value).toBe('MS777');
    expect(FlightNumber.of(' ms777 ').value).toBe('MS777');
    expect(FlightNumber.of('U21').value).toBe('U21');
    expect(FlightNumber.of('MS1').value).toBe('MS1');
    expect(FlightNumber.of('MS9999').value).toBe('MS9999');
  });

  it('US-AD-01-T05 rejects hyphens, 3-character airline codes and more than 4 digits', () => {
    for (const invalid of ['MS-001', 'ABC1234', 'MS12345', 'MS', '']) {
      expect(() => FlightNumber.of(invalid)).toThrow(InvalidFlightNumber);
    }
  });

  it('US-AD-01-T06 exposes the airline code the number starts with', () => {
    expect(FlightNumber.of('U21').airlineCode).toBe('U2');
  });

  it('US-AD-01-T07 rejects a flight whose number belongs to another airline', () => {
    expect(
      Flight.schedule(newFlight({ flightNumber: 'BA123', airlineCode: 'MS' }), {
        now: NOW,
        timeZoneOf: () => 'Africa/Cairo',
      }),
    ).toEqual({
      ok: false,
      error: 'AIRLINE_MISMATCH',
    });
  });
});

describe('US-FL-03 airport codes', () => {
  it('US-FL-03-T05 normalises valid IATA codes and rejects anything else', () => {
    expect(AirportCode.of(' cai ').value).toBe('CAI');
    for (const invalid of ['CAIRO', 'CA', 'C4I', '']) {
      expect(() => AirportCode.of(invalid)).toThrow(InvalidAirportCode);
    }
  });
});
