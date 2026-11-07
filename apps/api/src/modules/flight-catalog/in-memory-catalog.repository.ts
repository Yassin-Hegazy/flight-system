import { randomUUID } from 'node:crypto';
import type { Tx } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import type {
  AirlineRecord,
  AirportRecord,
  CatalogRepository,
  FareRecord,
} from './catalog.repository';
import { Flight } from './flight';
import type { Cabin, Route } from './value-objects';

/**
 * In-memory stand-in for PgCatalogRepository, so Catalog rules can be unit-tested in milliseconds
 * without a database. It ignores transactions.
 */
export class InMemoryCatalogRepository implements CatalogRepository {
  private readonly flights = new Map<string, Flight>();
  private readonly airports = new Map<string, AirportRecord>();
  private readonly airlines = new Map<string, AirlineRecord>();
  private readonly fares = new Map<string, FareRecord>();

  /** Test setup helpers. */
  addAirport(airport: AirportRecord): this {
    this.airports.set(airport.code, airport);
    return this;
  }

  addAirline(airline: AirlineRecord): this {
    this.airlines.set(airline.code, airline);
    return this;
  }

  addFlight(flight: Flight): string {
    const id = flight.id ?? randomUUID();
    this.flights.set(id, flight.withId(id));
    return id;
  }

  findFlight(id: string): Promise<Flight | null> {
    return Promise.resolve(this.copy(this.flights.get(id)));
  }

  findFlightForUpdate(_tx: Tx, id: string): Promise<Flight | null> {
    return this.findFlight(id);
  }

  findFlightsDeparting(route: Route, range: { start: Date; end: Date }): Promise<Flight[]> {
    const found = [...this.flights.values()]
      .filter(
        (flight) =>
          flight.route.origin.equals(route.origin) &&
          flight.route.destination.equals(route.destination) &&
          flight.scheduledDepartureUtc >= range.start &&
          flight.scheduledDepartureUtc < range.end,
      )
      .sort((a, b) => a.scheduledDepartureUtc.getTime() - b.scheduledDepartureUtc.getTime());
    return Promise.resolve(found.map((flight) => this.copy(flight) as Flight));
  }

  insertFlight(_tx: Tx, flight: Flight): Promise<Result<string, 'DUPLICATE_FLIGHT'>> {
    const duplicate = [...this.flights.values()].some(
      (existing) => existing.number.value === flight.number.value,
    );
    if (duplicate) return Promise.resolve(err('DUPLICATE_FLIGHT'));
    return Promise.resolve(ok(this.addFlight(flight)));
  }

  updateFlight(_tx: Tx, flight: Flight): Promise<void> {
    if (!flight.id) throw new Error('Cannot update a flight that has not been saved');
    this.flights.set(flight.id, flight);
    return Promise.resolve();
  }

  findAirports(codes: readonly string[]): Promise<AirportRecord[]> {
    return Promise.resolve(
      codes.flatMap((code) => {
        const airport = this.airports.get(code);
        return airport ? [airport] : [];
      }),
    );
  }

  searchAirports(query: string, limit: number): Promise<AirportRecord[]> {
    const q = query.toLowerCase();
    const matches = [...this.airports.values()]
      .filter(
        (airport) =>
          airport.code.toLowerCase().startsWith(q) ||
          airport.city.toLowerCase().includes(q) ||
          airport.name.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const exactA = a.code.toLowerCase() === q ? 0 : 1;
        const exactB = b.code.toLowerCase() === q ? 0 : 1;
        return exactA - exactB || a.code.localeCompare(b.code);
      });
    return Promise.resolve(matches.slice(0, limit));
  }

  saveAirport(_tx: Tx, airport: AirportRecord): Promise<void> {
    this.airports.set(airport.code, { ...airport });
    return Promise.resolve();
  }

  findAirlines(codes: readonly string[]): Promise<AirlineRecord[]> {
    return Promise.resolve(
      codes.flatMap((code) => {
        const airline = this.airlines.get(code);
        return airline ? [airline] : [];
      }),
    );
  }

  findFares(flightIds: readonly string[]): Promise<FareRecord[]> {
    return Promise.resolve(
      [...this.fares.values()].filter((fare) => flightIds.includes(fare.flightId)),
    );
  }

  findFare(_tx: Tx, flightId: string, cabin: Cabin): Promise<FareRecord | null> {
    return Promise.resolve(this.fares.get(`${flightId}:${cabin}`) ?? null);
  }

  saveFare(_tx: Tx, fare: FareRecord): Promise<void> {
    this.fares.set(`${fare.flightId}:${fare.cabin}`, { ...fare });
    return Promise.resolve();
  }

  /** Returns a separate object, as a database would, so tests cannot change stored state by accident. */
  private copy(flight: Flight | undefined): Flight | null {
    if (!flight) return null;
    return Flight.restore({
      id: flight.id,
      number: flight.number,
      airlineCode: flight.airlineCode,
      route: flight.route,
      scheduledDepartureUtc: flight.scheduledDepartureUtc,
      scheduledArrivalUtc: flight.scheduledArrivalUtc,
      estimatedDepartureUtc: flight.estimatedDepartureUtc,
      status: flight.status,
      cancelReason: flight.cancelReason,
    });
  }
}
