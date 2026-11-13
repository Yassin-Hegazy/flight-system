import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import type { Money } from '../../shared/money';
import { err, ok, type Result } from '../../shared/result';
import { CLOCK, type Clock, isValidTimeZone, localDayToUtcRange } from '../../shared/time';
import type {
  AirportError,
  AirportInput,
  AirportSuggestion,
  CatalogApi,
  ChangeStatusError,
  CreateFlightError,
  FareError,
  FlightInfo,
} from './catalog-api';
import {
  type AirportRecord,
  CATALOG_REPOSITORY,
  type CatalogRepository,
  type FareRecord,
} from './catalog.repository';
import { Flight, isBookable, isPositiveFare, type NewFlight } from './flight';
import { toFlightInfo } from './flight-info.mapper';
import type { FlightStatus } from './flight-status';
import { type PassengerMix, type PriceQuote, type PricingError, priceParty } from './pricing';
import {
  AirportCode,
  CABINS,
  type Cabin,
  InvalidAirportCode,
  isCabin,
  type Route,
} from './value-objects';

const MAX_AIRPORT_SUGGESTIONS = 10;
const MIN_AIRPORT_QUERY = 2;

/**
 * The Catalog's use cases. Rules live in the domain files, SQL in the repository; this class only
 * loads, applies the rule and saves.
 */
@Injectable()
export class FlightCatalogService implements CatalogApi {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repository: CatalogRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getFlightForUpdate(tx: Tx, id: string): Promise<FlightInfo | null> {
    const flight = await this.repository.findFlightForUpdate(tx, id);
    return flight ? (await this.describe([flight], [], tx))[0] : null;
  }

  async getFlight(id: string, tx?: Tx): Promise<FlightInfo | null> {
    const flight = await this.repository.findFlight(id, tx);
    if (!flight) return null;
    const [info] = await this.describe([flight], [], tx);
    return info;
  }

  /** Flights on a route departing during one calendar day at the origin airport (YYYY-MM-DD). */
  async findFlights(route: Route, localDate: string): Promise<FlightInfo[]> {
    const routeAirports = await this.repository.findAirports([
      route.origin.value,
      route.destination.value,
    ]);
    const origin = routeAirports.find((airport) => airport.code === route.origin.value);
    if (!origin) return [];
    const day = localDayToUtcRange(localDate, origin.timezone);
    const flights = await this.repository.findFlightsDeparting(route, day);
    return this.describe(flights, routeAirports);
  }

  async searchAirports(query: string): Promise<AirportSuggestion[]> {
    const normalized = query.trim();
    if (normalized.length < MIN_AIRPORT_QUERY) return [];
    const airports = await this.repository.searchAirports(normalized, MAX_AIRPORT_SUGGESTIONS);
    return airports.map(({ code, name, city, country }) => ({ code, name, city, country }));
  }

  isBookable(flight: FlightInfo, now: Date): boolean {
    return isBookable(flight, now);
  }

  priceParty(
    flight: FlightInfo,
    cabin: Cabin,
    party: PassengerMix,
  ): Result<PriceQuote, PricingError> {
    return priceParty(flight, cabin, party);
  }

  async createFlight(tx: Tx, input: NewFlight): Promise<Result<string, CreateFlightError>> {
    const normalize = (code: string) => code.trim().toUpperCase();
    const airports = await this.repository.findAirports(
      [input.originCode, input.destinationCode].map(normalize),
      tx,
    );
    const airlines = await this.repository.findAirlines([normalize(input.airlineCode)], tx);
    const timeZones = new Map(airports.map((airport) => [airport.code, airport.timezone]));
    const scheduled = Flight.schedule(input, {
      now: this.clock.now(),
      timeZoneOf: (code) => timeZones.get(code),
      airlineExists: (code) => airlines.some((airline) => airline.code === code),
    });
    if (!scheduled.ok) return scheduled;

    const inserted = await this.repository.insertFlight(tx, scheduled.value);
    if (!inserted.ok) return inserted;
    for (const cabin of CABINS) {
      await this.repository.saveFare(tx, {
        flightId: inserted.value,
        cabin,
        fare: input.fares[cabin],
      });
    }
    return inserted;
  }

  async changeStatus(
    tx: Tx,
    id: string,
    next: FlightStatus,
    estimatedDepartureUtc?: Date,
    cancelReason?: string,
  ): Promise<Result<FlightStatus, ChangeStatusError>> {
    const flight = await this.repository.findFlightForUpdate(tx, id);
    if (!flight) return err('FLIGHT_NOT_FOUND');
    const changed = flight.changeStatus(next, estimatedDepartureUtc, cancelReason);
    if (!changed.ok) return changed;
    await this.repository.updateFlight(tx, flight);
    return changed;
  }

  async setFare(
    tx: Tx,
    flightId: string,
    cabin: Cabin,
    fare: Money,
  ): Promise<Result<Money | null, FareError>> {
    if (!isCabin(cabin)) return err('INVALID_CABIN');
    if (!isPositiveFare(fare)) return err('INVALID_FARE');
    if (!(await this.repository.findFlightForUpdate(tx, flightId))) return err('FLIGHT_NOT_FOUND');
    const previous = await this.repository.findFare(tx, flightId, cabin);
    await this.repository.saveFare(tx, { flightId, cabin, fare });
    return ok(previous?.fare ?? null);
  }

  async upsertAirport(tx: Tx, input: AirportInput): Promise<Result<string, AirportError>> {
    let code: string;
    try {
      code = AirportCode.of(input.code).value;
    } catch (error) {
      if (error instanceof InvalidAirportCode) return err('INVALID_AIRPORT_CODE');
      throw error;
    }
    // A bad zone would make every read of this airport's flights fail (formatLocal throws).
    if (!isValidTimeZone(input.timezone)) return err('INVALID_TIMEZONE');
    const name = input.name.trim();
    const city = input.city.trim();
    const country = input.country.trim();
    if (!name || !city || !country) return err('INVALID_AIRPORT_DETAILS');
    await this.repository.saveAirport(tx, { code, name, city, country, timezone: input.timezone });
    return ok(code);
  }

  /**
   * Loads the reference data for many flights in a fixed number of queries, then maps them.
   * Airports the caller already loaded are not fetched again.
   */
  private async describe(
    flights: Flight[],
    knownAirports: AirportRecord[] = [],
    tx?: Tx,
  ): Promise<FlightInfo[]> {
    if (flights.length === 0) return [];
    const known = new Set(knownAirports.map((airport) => airport.code));
    const airportCodes = unique(
      flights.flatMap((flight) => [flight.route.origin.value, flight.route.destination.value]),
    ).filter((code) => !known.has(code));
    const airlineCodes = unique(flights.map((flight) => flight.airlineCode));
    const flightIds = flights.map((flight) => flight.id).filter((id): id is string => !!id);

    const findAirports = () =>
      airportCodes.length ? this.repository.findAirports(airportCodes, tx) : Promise.resolve([]);
    const findAirlines = () => this.repository.findAirlines(airlineCodes, tx);
    const findFares = () => this.repository.findFares(flightIds, tx);
    // A transaction has one connection. Outside a transaction, public searches can read in parallel.
    const [fetchedAirports, airlines, fares] = tx
      ? [await findAirports(), await findAirlines(), await findFares()]
      : await Promise.all([findAirports(), findAirlines(), findFares()]);

    const reference = {
      airports: new Map(
        [...knownAirports, ...fetchedAirports].map((airport) => [airport.code, airport]),
      ),
      airlines: new Map(airlines.map((airline) => [airline.code, airline])),
      faresByFlight: groupBy(fares, (fare) => fare.flightId),
    };
    return flights.map((flight) => toFlightInfo(flight, reference));
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function groupBy(
  fares: FareRecord[],
  key: (fare: FareRecord) => string,
): Map<string, FareRecord[]> {
  const groups = new Map<string, FareRecord[]>();
  for (const fare of fares) {
    const group = groups.get(key(fare)) ?? [];
    group.push(fare);
    groups.set(key(fare), group);
  }
  return groups;
}
