import { err, ok, type Result } from '../../shared/result';

/**
 * Small types that refuse to exist in an invalid state. Once a value object is held, it never
 * needs validating again (Catalog pack, section 3.1).
 */

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

/** An IATA-style flight number: a 2-character airline code, then 1 to 4 digits (MS777, U21). */
export class FlightNumber {
  private constructor(readonly value: string) {}

  static of(raw: string): FlightNumber {
    const value = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]{2}[0-9]{1,4}$/.test(value)) throw new InvalidFlightNumber(raw);
    return new FlightNumber(value);
  }

  /** The airline the number belongs to: its first two characters. */
  get airlineCode(): string {
    return this.value.slice(0, 2);
  }
}

/** An origin and a destination that are different airports. */
export class Route {
  private constructor(
    readonly origin: AirportCode,
    readonly destination: AirportCode,
  ) {}

  static between(origin: AirportCode, destination: AirportCode): Result<Route, 'SAME_AIRPORT'> {
    if (origin.equals(destination)) return err('SAME_AIRPORT');
    return ok(new Route(origin, destination));
  }
}

/** Every flight has exactly these two cabins, each with its own capacity and fare (overview 4.3). */
export const CABINS = ['ECONOMY', 'BUSINESS'] as const;
export type Cabin = (typeof CABINS)[number];

export function isCabin(value: string): value is Cabin {
  return (CABINS as readonly string[]).includes(value);
}
