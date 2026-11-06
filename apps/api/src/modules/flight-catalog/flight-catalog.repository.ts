import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AirlineEntity } from './airline.entity';
import { AirportEntity } from './airport.entity';
import { FlightFareEntity } from './flight-fare.entity';
import { FlightEntity } from './flight.entity';

@Injectable()
export class FlightCatalogRepository {
  constructor(
    @InjectRepository(AirlineEntity) private readonly airlines: Repository<AirlineEntity>,
    @InjectRepository(AirportEntity) private readonly airports: Repository<AirportEntity>,
    @InjectRepository(FlightEntity) private readonly flights: Repository<FlightEntity>,
    @InjectRepository(FlightFareEntity) private readonly fares: Repository<FlightFareEntity>,
  ) {}

  getFlight(id: string) {
    return this.flights.findOne({ where: { id } });
  }

  getAirline(code: string) {
    return this.airlines.findOneBy({ code });
  }

  getAirport(code: string) {
    return this.airports.findOneBy({ code });
  }

  getFares(flightId: string) {
    return this.fares.find({ where: { flightId } });
  }

  findFlights(originCode: string, destinationCode: string, start: Date, end: Date) {
    return this.flights.find({
      where: { originCode, destinationCode },
      order: { scheduledDepartureUtc: 'ASC' },
    }).then((rows) =>
      rows.filter((row) => row.scheduledDepartureUtc >= start && row.scheduledDepartureUtc < end),
    );
  }

  searchAirports(query: string) {
    return this.airports
      .createQueryBuilder('airport')
      .where('LOWER(airport.code) LIKE LOWER(:query)', { query: `${query}%` })
      .orWhere('LOWER(airport.city) LIKE LOWER(:contains)', { contains: `%${query}%` })
      .orWhere('LOWER(airport.name) LIKE LOWER(:contains)', { contains: `%${query}%` })
      .orderBy('CASE WHEN LOWER(airport.code) = LOWER(:exact) THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('airport.code', 'ASC')
      .setParameters({ exact: query })
      .take(10)
      .getMany();
  }

  saveFlight(flight: FlightEntity) {
    return this.flights.save(flight);
  }

  saveFare(fare: FlightFareEntity) {
    return this.fares.save(fare);
  }

  saveAirport(airport: AirportEntity) {
    return this.airports.save(airport);
  }
}
