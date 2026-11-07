import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import { CLOCK, type Clock } from '../../shared/time';
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
import { CATALOG_REPOSITORY, type CatalogRepository, type FareRecord } from './catalog.repository';
import { Flight, isBookable, type NewFlight } from './flight';
import { toFlightInfo } from './flight-info.mapper';
import type { FlightStatus } from './flight-status';
import { type Fare, type PassengerMix, type PriceQuote, priceParty } from './pricing';
import { AirportCode, type Cabin, InvalidAirportCode, type Route } from './value-objects';

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

  async getFlight(id: string): Promise<FlightInfo | null> {
    const flight = await this.repository.findFlight(id);
    if (!flight) return null;
    const [info] = await this.describe([flight]);
    return info;
  }

  async findFlights(route: Route, localDate: string): Promise<FlightInfo[]> {
    const [year, month, day] = localDate.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    const end = new Date(start.getTime() + 86_400_000);
    const flights = await this.repository.findFlightsDeparting(route, { start, end });
    return this.describe(flights);
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

  priceParty(flight: FlightInfo, cabin: Cabin, party: PassengerMix): PriceQuote {
    return priceParty(flight, cabin, party);
  }

  async createFlight(tx: Tx, input: NewFlight): Promise<Result<string, CreateFlightError>> {
    const scheduled = Flight.schedule(input, this.clock.now());
    if (!scheduled.ok) return scheduled;
    return this.repository.insertFlight(tx, scheduled.value);
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
    fare: Fare,
  ): Promise<Result<Fare | null, FareError>> {
    if (fare.amount <= 0 || !/^[A-Z]{3}$/.test(fare.currency)) return err('INVALID_FARE');
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
    await this.repository.saveAirport(tx, { ...input, code });
    return ok(code);
  }

  /** Loads the reference data for many flights in a fixed number of queries, then maps them. */
  private async describe(flights: Flight[]): Promise<FlightInfo[]> {
    if (flights.length === 0) return [];
    const airportCodes = unique(
      flights.flatMap((flight) => [flight.route.origin.value, flight.route.destination.value]),
    );
    const airlineCodes = unique(flights.map((flight) => flight.airlineCode));
    const flightIds = flights.map((flight) => flight.id).filter((id): id is string => !!id);

    const [airports, airlines, fares] = await Promise.all([
      this.repository.findAirports(airportCodes),
      this.repository.findAirlines(airlineCodes),
      this.repository.findFares(flightIds),
    ]);

    const reference = {
      airports: new Map(airports.map((airport) => [airport.code, airport])),
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
