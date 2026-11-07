import type { Result } from '../../shared/result';
import type { Tx } from '../../shared/db';
import type { NewFlight, FlightRuleError, StatusRuleError } from './flight';
import type { FlightStatus } from './flight-status';
import type { Fare, PassengerMix, PriceQuote } from './pricing';
import type { Cabin, Route } from './value-objects';

/** What other modules learn about a flight. Times are UTC instants plus airport-local strings. */
export interface FlightInfo {
  id: string;
  flightNumber: string;
  airline: { code: string; name: string };
  origin: AirportInfo;
  destination: AirportInfo;
  scheduledDepartureUtc: Date;
  scheduledArrivalUtc: Date;
  scheduledDepartureLocal: string;
  scheduledArrivalLocal: string;
  durationMinutes: number;
  estimatedDepartureUtc?: Date;
  status: FlightStatus;
  cancelReason?: string;
  fares: Partial<Record<Cabin, Fare>>;
}

export interface AirportInfo {
  code: string;
  name: string;
  city: string;
  timezone: string;
}

export interface AirportSuggestion {
  code: string;
  name: string;
  city: string;
  country: string;
}

export interface AirportInput {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export type CreateFlightError = FlightRuleError | 'DUPLICATE_FLIGHT';
export type ChangeStatusError = StatusRuleError | 'FLIGHT_NOT_FOUND';
export type FareError = 'FLIGHT_NOT_FOUND' | 'INVALID_FARE';
export type AirportError = 'INVALID_AIRPORT_CODE';

/**
 * The Catalog's public boundary (Catalog pack, section 2). Reads are for any module; the write
 * methods are for Administration commands and run inside the command's transaction.
 */
export interface CatalogApi {
  getFlight(id: string): Promise<FlightInfo | null>;
  findFlights(route: Route, localDate: string): Promise<FlightInfo[]>;
  searchAirports(query: string): Promise<AirportSuggestion[]>;
  isBookable(flight: FlightInfo, now: Date): boolean;
  priceParty(flight: FlightInfo, cabin: Cabin, party: PassengerMix): PriceQuote;

  createFlight(tx: Tx, input: NewFlight): Promise<Result<string, CreateFlightError>>;
  changeStatus(
    tx: Tx,
    id: string,
    next: FlightStatus,
    estimatedDepartureUtc?: Date,
    cancelReason?: string,
  ): Promise<Result<FlightStatus, ChangeStatusError>>;
  setFare(tx: Tx, id: string, cabin: Cabin, fare: Fare): Promise<Result<Fare | null, FareError>>;
  upsertAirport(tx: Tx, input: AirportInput): Promise<Result<string, AirportError>>;
}

/** Injection token: other modules depend on the interface, never on the class behind it. */
export const CATALOG_API = Symbol('CATALOG_API');
