import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In } from 'typeorm';
import { isUniqueViolation, type Tx } from '../../shared/db';
import { err, ok, type Result } from '../../shared/result';
import { AirlineEntity } from './airline.entity';
import { AirportEntity } from './airport.entity';
import type {
  AirlineRecord,
  AirportRecord,
  CatalogRepository,
  FareRecord,
} from './catalog.repository';
import { Flight } from './flight';
import { FlightFareEntity } from './flight-fare.entity';
import { parseFlightStatus } from './flight-status';
import { FlightEntity } from './flight.entity';
import { AirportCode, type Cabin, FlightNumber, Route } from './value-objects';

/** PostgreSQL implementation of CatalogRepository: the only file with SQL for Catalog tables. */
@Injectable()
export class PgCatalogRepository implements CatalogRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get db(): EntityManager {
    return this.dataSource.manager;
  }

  async findFlight(id: string): Promise<Flight | null> {
    const row = await this.db.findOne(FlightEntity, { where: { id } });
    return row ? toFlight(row) : null;
  }

  async findFlightForUpdate(tx: Tx, id: string): Promise<Flight | null> {
    const row = await tx.findOne(FlightEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? toFlight(row) : null;
  }

  async findFlightsDeparting(route: Route, range: { start: Date; end: Date }): Promise<Flight[]> {
    const rows = await this.db
      .createQueryBuilder(FlightEntity, 'flight')
      .where('flight.originCode = :origin', { origin: route.origin.value })
      .andWhere('flight.destinationCode = :destination', { destination: route.destination.value })
      .andWhere('flight.scheduledDepartureUtc >= :start', { start: range.start })
      .andWhere('flight.scheduledDepartureUtc < :end', { end: range.end })
      .orderBy('flight.scheduledDepartureUtc', 'ASC')
      .getMany();
    return rows.map(toFlight);
  }

  /**
   * Inserts a new flight. A duplicate is reported as a result; PostgreSQL has then aborted the
   * transaction, so the caller must roll back.
   */
  async insertFlight(tx: Tx, flight: Flight): Promise<Result<string, 'DUPLICATE_FLIGHT'>> {
    try {
      const saved = await tx.save(FlightEntity, toRow(flight));
      return ok(saved.id);
    } catch (error) {
      if (isUniqueViolation(error)) return err('DUPLICATE_FLIGHT');
      throw error;
    }
  }

  async updateFlight(tx: Tx, flight: Flight): Promise<void> {
    if (!flight.id) throw new Error('Cannot update a flight that has not been saved');
    await tx.update(FlightEntity, { id: flight.id }, toRow(flight));
  }

  async findAirports(codes: readonly string[]): Promise<AirportRecord[]> {
    if (codes.length === 0) return [];
    return this.db.find(AirportEntity, { where: { code: In([...codes]) } });
  }

  async searchAirports(query: string, limit: number): Promise<AirportRecord[]> {
    return this.db
      .createQueryBuilder(AirportEntity, 'airport')
      .where('LOWER(airport.code) LIKE LOWER(:prefix)', { prefix: `${query}%` })
      .orWhere('LOWER(airport.city) LIKE LOWER(:contains)', { contains: `%${query}%` })
      .orWhere('LOWER(airport.name) LIKE LOWER(:contains)', { contains: `%${query}%` })
      .orderBy('CASE WHEN LOWER(airport.code) = LOWER(:exact) THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('airport.code', 'ASC')
      .setParameters({ exact: query })
      .take(limit)
      .getMany();
  }

  async saveAirport(tx: Tx, airport: AirportRecord): Promise<void> {
    await tx.save(AirportEntity, { ...airport });
  }

  async findAirlines(codes: readonly string[]): Promise<AirlineRecord[]> {
    if (codes.length === 0) return [];
    return this.db.find(AirlineEntity, { where: { code: In([...codes]) } });
  }

  async findFares(flightIds: readonly string[]): Promise<FareRecord[]> {
    if (flightIds.length === 0) return [];
    const rows = await this.db.find(FlightFareEntity, { where: { flightId: In([...flightIds]) } });
    return rows.map(toFareRecord);
  }

  async findFare(tx: Tx, flightId: string, cabin: Cabin): Promise<FareRecord | null> {
    const row = await tx.findOne(FlightFareEntity, { where: { flightId, cabin } });
    return row ? toFareRecord(row) : null;
  }

  async saveFare(tx: Tx, fare: FareRecord): Promise<void> {
    await tx.upsert(
      FlightFareEntity,
      {
        flightId: fare.flightId,
        cabin: fare.cabin,
        amount: fare.fare.amount,
        currency: fare.fare.currency,
      },
      ['flightId', 'cabin'],
    );
  }
}

function toFlight(row: FlightEntity): Flight {
  const route = Route.between(AirportCode.of(row.originCode), AirportCode.of(row.destinationCode));
  if (!route.ok) throw new Error(`Stored flight ${row.id} has the same origin and destination`);
  return Flight.restore({
    id: row.id,
    number: FlightNumber.of(row.flightNumber),
    airlineCode: row.airlineCode,
    route: route.value,
    scheduledDepartureUtc: row.scheduledDepartureUtc,
    scheduledArrivalUtc: row.scheduledArrivalUtc,
    estimatedDepartureUtc: row.estimatedDepartureUtc,
    status: parseFlightStatus(row.status),
    cancelReason: row.cancelReason,
  });
}

function toRow(flight: Flight): Partial<FlightEntity> {
  return {
    ...(flight.id ? { id: flight.id } : {}),
    flightNumber: flight.number.value,
    airlineCode: flight.airlineCode,
    originCode: flight.route.origin.value,
    destinationCode: flight.route.destination.value,
    scheduledDepartureUtc: flight.scheduledDepartureUtc,
    scheduledArrivalUtc: flight.scheduledArrivalUtc,
    estimatedDepartureUtc: flight.estimatedDepartureUtc,
    status: flight.status,
    cancelReason: flight.cancelReason,
  };
}

function toFareRecord(row: FlightFareEntity): FareRecord {
  return {
    flightId: row.flightId,
    cabin: row.cabin as Cabin,
    fare: { amount: Number(row.amount), currency: row.currency },
  };
}
