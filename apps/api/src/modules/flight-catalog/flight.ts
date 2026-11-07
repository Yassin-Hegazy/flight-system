import type { Money } from '../../shared/money';
import { err, ok, type Result } from '../../shared/result';
import { localDateOf } from '../../shared/time';
import { canTransition, FlightStatus } from './flight-status';
import {
  AirportCode,
  CABINS,
  type Cabin,
  FlightNumber,
  InvalidAirportCode,
  InvalidFlightNumber,
  Route,
} from './value-objects';

export interface NewFlight {
  flightNumber: string;
  airlineCode: string;
  originCode: string;
  destinationCode: string;
  scheduledDepartureUtc: Date;
  scheduledArrivalUtc: Date;
  /** The adult fare of each cabin, in integer minor units. */
  fares: Record<Cabin, Money>;
}

export type FlightRuleError =
  | 'INVALID_FLIGHT_NUMBER'
  | 'INVALID_AIRPORT_CODE'
  | 'AIRLINE_MISMATCH'
  | 'UNKNOWN_AIRLINE'
  | 'SAME_AIRPORT'
  | 'UNKNOWN_AIRPORT'
  | 'ARRIVAL_NOT_AFTER_DEPARTURE'
  | 'DEPARTURE_IN_PAST'
  | 'MISSING_FARE'
  | 'FARE_NOT_POSITIVE';

export type StatusRuleError =
  | 'INVALID_TRANSITION'
  | 'ESTIMATE_REQUIRED'
  | 'ESTIMATE_NOT_AFTER_SCHEDULED'
  | 'ESTIMATE_NOT_ALLOWED';

/** What scheduling needs from outside the flight: the time, airport time zones, known airlines. */
export interface ScheduleContext {
  now: Date;
  timeZoneOf(airportCode: string): string | undefined;
  airlineExists(airlineCode: string): boolean;
}

export interface FlightProps {
  id: string | null;
  number: FlightNumber;
  airlineCode: string;
  route: Route;
  scheduledDepartureUtc: Date;
  scheduledArrivalUtc: Date;
  /** The calendar date of departure at the origin airport (YYYY-MM-DD). */
  departureLocalDate: string;
  estimatedDepartureUtc: Date | null;
  status: FlightStatus;
  cancelReason: string | null;
}

/** One dated departure and the rules about its schedule and status. */
export class Flight {
  private constructor(private props: FlightProps) {}

  /** Rebuilds a flight that was already valid when it was stored. */
  static restore(props: FlightProps): Flight {
    return new Flight({ ...props });
  }

  /** Validates a new flight; the first broken rule is the one reported. */
  static schedule(input: NewFlight, context: ScheduleContext): Result<Flight, FlightRuleError> {
    let number: FlightNumber;
    let origin: AirportCode;
    let destination: AirportCode;
    try {
      number = FlightNumber.of(input.flightNumber);
      origin = AirportCode.of(input.originCode);
      destination = AirportCode.of(input.destinationCode);
    } catch (error) {
      if (error instanceof InvalidFlightNumber) return err('INVALID_FLIGHT_NUMBER');
      if (error instanceof InvalidAirportCode) return err('INVALID_AIRPORT_CODE');
      throw error;
    }

    const airlineCode = input.airlineCode.trim().toUpperCase();
    if (number.airlineCode !== airlineCode) return err('AIRLINE_MISMATCH');
    if (!context.airlineExists(airlineCode)) return err('UNKNOWN_AIRLINE');
    const route = Route.between(origin, destination);
    if (!route.ok) return route;
    const originTimeZone = context.timeZoneOf(origin.value);
    if (!originTimeZone || !context.timeZoneOf(destination.value)) return err('UNKNOWN_AIRPORT');
    if (input.scheduledArrivalUtc.getTime() <= input.scheduledDepartureUtc.getTime()) {
      return err('ARRIVAL_NOT_AFTER_DEPARTURE');
    }
    if (input.scheduledDepartureUtc.getTime() <= context.now.getTime()) {
      return err('DEPARTURE_IN_PAST');
    }
    for (const cabin of CABINS) {
      const fare = input.fares?.[cabin] as Money | undefined;
      if (!fare) return err('MISSING_FARE');
      if (!isPositiveFare(fare)) return err('FARE_NOT_POSITIVE');
    }

    return ok(
      new Flight({
        id: null,
        number,
        airlineCode,
        route: route.value,
        scheduledDepartureUtc: input.scheduledDepartureUtc,
        scheduledArrivalUtc: input.scheduledArrivalUtc,
        departureLocalDate: localDateOf(input.scheduledDepartureUtc, originTimeZone),
        estimatedDepartureUtc: null,
        status: FlightStatus.Scheduled,
        cancelReason: null,
      }),
    );
  }

  get id(): string | null {
    return this.props.id;
  }
  get number(): FlightNumber {
    return this.props.number;
  }
  get airlineCode(): string {
    return this.props.airlineCode;
  }
  get route(): Route {
    return this.props.route;
  }
  get scheduledDepartureUtc(): Date {
    return this.props.scheduledDepartureUtc;
  }
  get scheduledArrivalUtc(): Date {
    return this.props.scheduledArrivalUtc;
  }
  get departureLocalDate(): string {
    return this.props.departureLocalDate;
  }
  get estimatedDepartureUtc(): Date | null {
    return this.props.estimatedDepartureUtc;
  }
  get status(): FlightStatus {
    return this.props.status;
  }
  get cancelReason(): string | null {
    return this.props.cancelReason;
  }

  /** Duration from the two UTC instants, never from local clock times. */
  get durationMinutes(): number {
    return Math.round(
      (this.props.scheduledArrivalUtc.getTime() - this.props.scheduledDepartureUtc.getTime()) /
        60_000,
    );
  }

  withId(id: string): Flight {
    return new Flight({ ...this.props, id });
  }

  /**
   * Moves the flight to a new status and returns the status it had before. A DELAYED update must
   * carry an estimated departure later than the scheduled one (overview 4.2); no other status
   * takes an estimate.
   */
  changeStatus(
    next: FlightStatus,
    estimatedDepartureUtc?: Date,
    cancelReason?: string,
  ): Result<FlightStatus, StatusRuleError> {
    const previous = this.props.status;
    if (!canTransition(previous, next)) return err('INVALID_TRANSITION');
    if (next === FlightStatus.Delayed) {
      if (!estimatedDepartureUtc) return err('ESTIMATE_REQUIRED');
      if (estimatedDepartureUtc.getTime() <= this.props.scheduledDepartureUtc.getTime()) {
        return err('ESTIMATE_NOT_AFTER_SCHEDULED');
      }
    } else if (estimatedDepartureUtc) {
      return err('ESTIMATE_NOT_ALLOWED');
    }
    this.props = {
      ...this.props,
      status: next,
      estimatedDepartureUtc: estimatedDepartureUtc ?? this.props.estimatedDepartureUtc,
      cancelReason: next === FlightStatus.Cancelled ? (cancelReason ?? null) : null,
    };
    return ok(previous);
  }
}

/** A fare is a positive whole number of minor units in an ISO 4217 currency. */
export function isPositiveFare(fare: Money): boolean {
  return (
    Number.isSafeInteger(fare.amountMinor) &&
    fare.amountMinor > 0 &&
    /^[A-Z]{3}$/.test(fare.currency)
  );
}

export interface BookabilityView {
  status: FlightStatus;
  scheduledDepartureUtc: Date;
  estimatedDepartureUtc?: Date | null;
}

/** Sales close this long before departure (overview 4.2, proposed). */
export const BOOKING_CUTOFF_MS = 2 * 60 * 60 * 1000;

/**
 * Whether seats on this flight may still be sold at `now`: only while SCHEDULED or DELAYED and more
 * than 2 hours before departure, measured from the estimated departure when delayed. Pure: no I/O.
 */
export function isBookable(flight: BookabilityView, now: Date): boolean {
  if (flight.status !== FlightStatus.Scheduled && flight.status !== FlightStatus.Delayed) {
    return false;
  }
  const departure =
    flight.status === FlightStatus.Delayed && flight.estimatedDepartureUtc
      ? flight.estimatedDepartureUtc
      : flight.scheduledDepartureUtc;
  return departure.getTime() - now.getTime() > BOOKING_CUTOFF_MS;
}
