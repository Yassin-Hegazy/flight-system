export class InvalidAirportCode extends Error {
  constructor(value: string) {
    super(`Invalid airport code: ${value}`);
    this.name = 'InvalidAirportCode';
  }
}

export class AirportCode {
  private constructor(readonly value: string) {}

  static of(raw: string): AirportCode {
    const value = raw.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(value)) throw new InvalidAirportCode(raw);
    return new AirportCode(value);
  }

  equals(other: AirportCode): boolean {
    return this.value === other.value;
  }
}

export class InvalidFlightNumber extends Error {
  constructor(value: string) {
    super(`Invalid flight number: ${value}`);
    this.name = 'InvalidFlightNumber';
  }
}

export class FlightNumber {
  private constructor(readonly value: string) {}

  static of(raw: string): FlightNumber {
    const value = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,3}-?[0-9]{1,4}$/.test(value)) {
      throw new InvalidFlightNumber(raw);
    }
    return new FlightNumber(value);
  }
}

export enum FlightStatus {
  Scheduled = 'SCHEDULED',
  Delayed = 'DELAYED',
  Boarding = 'BOARDING',
  Departed = 'DEPARTED',
  Arrived = 'ARRIVED',
  Cancelled = 'CANCELLED',
}

const transitions: Record<FlightStatus, readonly FlightStatus[]> = {
  [FlightStatus.Scheduled]: [FlightStatus.Delayed, FlightStatus.Boarding, FlightStatus.Cancelled],
  [FlightStatus.Delayed]: [FlightStatus.Boarding, FlightStatus.Cancelled],
  [FlightStatus.Boarding]: [FlightStatus.Departed, FlightStatus.Cancelled],
  [FlightStatus.Departed]: [FlightStatus.Arrived],
  [FlightStatus.Arrived]: [],
  [FlightStatus.Cancelled]: [],
};

export class InvalidFlightStatus extends Error {
  constructor(value: string) {
    super(`Invalid flight status: ${value}`);
    this.name = 'InvalidFlightStatus';
  }
}

export class InvalidStatusTransition extends Error {
  constructor(from: FlightStatus, to: FlightStatus) {
    super(`Cannot change flight status from ${from} to ${to}`);
    this.name = 'InvalidStatusTransition';
  }
}

export class FlightStatusValue {
  private constructor(readonly value: FlightStatus) {}

  static of(raw: string): FlightStatusValue {
    const value = raw.trim().toUpperCase() as FlightStatus;
    if (!Object.values(FlightStatus).includes(value)) throw new InvalidFlightStatus(raw);
    return new FlightStatusValue(value);
  }

  canTransitionTo(next: FlightStatusValue): boolean {
    return transitions[this.value].includes(next.value);
  }

  transitionTo(next: FlightStatusValue): FlightStatusValue {
    if (!this.canTransitionTo(next)) throw new InvalidStatusTransition(this.value, next.value);
    return next;
  }
}

export type Cabin = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';

export interface PassengerMix {
  adults: number;
  children?: number;
  infants?: number;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface Route {
  origin: AirportCode;
  destination: AirportCode;
}

export interface FlightInfo {
  id: string;
  flightNumber: string;
  airline: { code: string; name: string };
  origin: { code: string; name: string; city: string; timezone: string };
  destination: { code: string; name: string; city: string; timezone: string };
  scheduledDepartureUtc: Date;
  scheduledArrivalUtc: Date;
  scheduledDepartureLocal: string;
  scheduledArrivalLocal: string;
  durationMinutes: number;
  estimatedDepartureUtc?: Date;
  status: FlightStatus;
  cancelReason?: string;
  fares: Partial<Record<Cabin, Money>>;
}

export interface AirportSuggestion {
  code: string;
  name: string;
  city: string;
  country: string;
}

export interface PriceQuote {
  currency: string;
  total: number;
  breakdown: { cabin: Cabin; quantity: number; unitAmount: number; amount: number }[];
}

export function formatInTimezone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute} ${values.timeZoneName}`;
}

export function isBookable(flight: FlightInfo, now: Date): boolean {
  return flight.status !== FlightStatus.Cancelled &&
    flight.status !== FlightStatus.Departed &&
    flight.status !== FlightStatus.Arrived &&
    flight.scheduledDepartureUtc.getTime() > now.getTime();
}

export function priceParty(flight: FlightInfo, cabin: Cabin, party: PassengerMix): PriceQuote {
  const quantity = party.adults + (party.children ?? 0);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('At least one adult or child is required');
  const fare = flight.fares[cabin];
  if (!fare) throw new Error(`No fare is configured for ${cabin}`);
  return {
    currency: fare.currency,
    total: fare.amount * quantity,
    breakdown: [{ cabin, quantity, unitAmount: fare.amount, amount: fare.amount * quantity }],
  };
}
