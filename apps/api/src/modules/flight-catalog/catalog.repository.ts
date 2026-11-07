import type { Tx } from '../../shared/db';
import type { Result } from '../../shared/result';
import type { Flight } from './flight';
import type { Fare } from './pricing';
import type { Cabin, Route } from './value-objects';

export interface AirportRecord {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export interface AirlineRecord {
  code: string;
  name: string;
}

export interface FareRecord {
  flightId: string;
  cabin: Cabin;
  fare: Fare;
}

/**
 * Everything the Catalog's use cases need from storage, and nothing about how it is stored
 * (Repository pattern, Catalog pack section 7). PgCatalogRepository is the only file with SQL for
 * this module's tables; InMemoryCatalogRepository stands in for it in unit tests.
 */
export interface CatalogRepository {
  findFlight(id: string): Promise<Flight | null>;
  /** Loads a flight and locks its row until the transaction ends. */
  findFlightForUpdate(tx: Tx, id: string): Promise<Flight | null>;
  findFlightsDeparting(route: Route, range: { start: Date; end: Date }): Promise<Flight[]>;
  insertFlight(tx: Tx, flight: Flight): Promise<Result<string, 'DUPLICATE_FLIGHT'>>;
  updateFlight(tx: Tx, flight: Flight): Promise<void>;

  findAirports(codes: readonly string[]): Promise<AirportRecord[]>;
  searchAirports(query: string, limit: number): Promise<AirportRecord[]>;
  saveAirport(tx: Tx, airport: AirportRecord): Promise<void>;

  findAirlines(codes: readonly string[]): Promise<AirlineRecord[]>;

  findFares(flightIds: readonly string[]): Promise<FareRecord[]>;
  findFare(tx: Tx, flightId: string, cabin: Cabin): Promise<FareRecord | null>;
  saveFare(tx: Tx, fare: FareRecord): Promise<void>;
}

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');
