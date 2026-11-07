import { describe, expect, it } from 'vitest';
import { Flight } from './flight';
import { FlightStatus, InvalidFlightStatus, parseFlightStatus } from './flight-status';
import { AirportCode, FlightNumber, Route } from './value-objects';

const SCHEDULED_DEPARTURE = new Date('2026-12-10T07:00:00Z');
const LATER = new Date('2026-12-10T09:00:00Z');

function flightIn(status: FlightStatus): Flight {
  const route = Route.between(AirportCode.of('CAI'), AirportCode.of('LHR'));
  if (!route.ok) throw new Error(route.error);
  return Flight.restore({
    id: 'f1',
    number: FlightNumber.of('MS777'),
    airlineCode: 'MS',
    route: route.value,
    scheduledDepartureUtc: SCHEDULED_DEPARTURE,
    scheduledArrivalUtc: new Date('2026-12-10T12:00:00Z'),
    estimatedDepartureUtc:
      status === FlightStatus.Delayed ? new Date('2026-12-10T08:00:00Z') : null,
    status,
    cancelReason: null,
  });
}

// Overview section 4.2, written out as the test plan: every legal transition is accepted and every
// other pair is rejected (state-transition testing).
const LEGAL: Record<FlightStatus, FlightStatus[]> = {
  [FlightStatus.Scheduled]: [FlightStatus.Delayed, FlightStatus.Boarding, FlightStatus.Cancelled],
  [FlightStatus.Delayed]: [FlightStatus.Delayed, FlightStatus.Boarding, FlightStatus.Cancelled],
  [FlightStatus.Boarding]: [FlightStatus.Departed, FlightStatus.Cancelled],
  [FlightStatus.Departed]: [FlightStatus.Arrived],
  [FlightStatus.Arrived]: [],
  [FlightStatus.Cancelled]: [],
};

const ALL = Object.values(FlightStatus);

describe('US-FL-02 See current flight status', () => {
  it('US-FL-02-T01 each of the six statuses can be built from its name', () => {
    for (const status of ALL) expect(parseFlightStatus(status.toLowerCase())).toBe(status);
  });

  it('US-FL-02-T02 an unsupported status cannot be built', () => {
    expect(() => parseFlightStatus('LANDED')).toThrow(InvalidFlightStatus);
    expect(() => parseFlightStatus('DELAYD')).toThrow(InvalidFlightStatus);
  });

  it('US-FL-02-T08 all 36 from-to pairs: legal transitions succeed, all others are rejected', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const estimate = to === FlightStatus.Delayed ? LATER : undefined;
        const result = flightIn(from).changeStatus(to, estimate);
        const expected = LEGAL[from].includes(to)
          ? { ok: true, value: from }
          : { ok: false, error: 'INVALID_TRANSITION' };
        expect({ from, to, result }).toEqual({ from, to, result: expected });
      }
    }
  });

  it('US-FL-02-T09 a delay can be extended with a later estimated departure', () => {
    const flight = flightIn(FlightStatus.Delayed);
    expect(flight.changeStatus(FlightStatus.Delayed, LATER)).toEqual({
      ok: true,
      value: FlightStatus.Delayed,
    });
    expect(flight.estimatedDepartureUtc).toEqual(LATER);
  });

  it('US-FL-02-T10 a DELAYED update must carry an estimate later than the scheduled departure', () => {
    expect(flightIn(FlightStatus.Scheduled).changeStatus(FlightStatus.Delayed)).toEqual({
      ok: false,
      error: 'ESTIMATE_REQUIRED',
    });
    expect(
      flightIn(FlightStatus.Scheduled).changeStatus(FlightStatus.Delayed, SCHEDULED_DEPARTURE),
    ).toEqual({ ok: false, error: 'ESTIMATE_NOT_AFTER_SCHEDULED' });
  });

  it('US-FL-02-T11 an estimated departure is only accepted with a delay', () => {
    expect(flightIn(FlightStatus.Scheduled).changeStatus(FlightStatus.Boarding, LATER)).toEqual({
      ok: false,
      error: 'ESTIMATE_NOT_ALLOWED',
    });
  });

  it('US-FL-02-T12 a cancellation keeps its reason; a departed flight cannot be cancelled', () => {
    const flight = flightIn(FlightStatus.Boarding);
    expect(flight.changeStatus(FlightStatus.Cancelled, undefined, 'Technical fault').ok).toBe(true);
    expect(flight.cancelReason).toBe('Technical fault');
    expect(flightIn(FlightStatus.Departed).changeStatus(FlightStatus.Cancelled)).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    });
  });
});
