import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AirportEntity } from './airport.entity';
import {
  AirportCode,
  AirportSuggestion,
  Cabin,
  FlightInfo,
  FlightNumber,
  FlightStatus,
  FlightStatusValue,
  Money,
  PassengerMix,
  PriceQuote,
  Route,
  formatInTimezone,
  isBookable,
  priceParty,
} from './flight-catalog.domain';
import { FlightFareEntity } from './flight-fare.entity';
import { FlightEntity } from './flight.entity';
import { FlightCatalogRepository } from './flight-catalog.repository';

@Injectable()
export class FlightCatalogService {
  constructor(private readonly repository: FlightCatalogRepository) {}

  async getFlight(id: string): Promise<FlightInfo> {
    const flight = await this.repository.getFlight(id);
    if (!flight) throw new NotFoundException('Flight not found');
    const [airline, origin, destination, fares] = await Promise.all([
      this.repository.getAirline(flight.airlineCode),
      this.repository.getAirport(flight.originCode),
      this.repository.getAirport(flight.destinationCode),
      this.repository.getFares(flight.id),
    ]);
    if (!airline || !origin || !destination) {
      throw new UnprocessableEntityException('Flight references missing catalog data');
    }
    return {
      id: flight.id,
      flightNumber: FlightNumber.of(flight.flightNumber).value,
      airline: { code: airline.code, name: airline.name },
      origin: { code: origin.code, name: origin.name, city: origin.city, timezone: origin.timezone },
      destination: { code: destination.code, name: destination.name, city: destination.city, timezone: destination.timezone },
      scheduledDepartureUtc: flight.scheduledDepartureUtc,
      scheduledArrivalUtc: flight.scheduledArrivalUtc,
      scheduledDepartureLocal: formatInTimezone(flight.scheduledDepartureUtc, origin.timezone),
      scheduledArrivalLocal: formatInTimezone(flight.scheduledArrivalUtc, destination.timezone),
      durationMinutes: Math.round((flight.scheduledArrivalUtc.getTime() - flight.scheduledDepartureUtc.getTime()) / 60000),
      estimatedDepartureUtc: flight.estimatedDepartureUtc ?? undefined,
      status: FlightStatusValue.of(flight.status).value,
      cancelReason: flight.cancelReason ?? undefined,
      fares: Object.fromEntries(fares.map((fare) => [fare.cabin, { amount: Number(fare.amount), currency: fare.currency }])),
    };
  }

  async findFlights(route: Route, localDate: string): Promise<FlightInfo[]> {
    const origin = await this.repository.getAirport(route.origin.value);
    const destination = await this.repository.getAirport(route.destination.value);
    if (!origin || !destination) return [];
    const startParts = localDate.split('-').map(Number);
    const start = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
    const end = new Date(start.getTime() + 86_400_000);
    const rows = await this.repository.findFlights(origin.code, destination.code, start, end);
    return Promise.all(rows.map((row) => this.getFlight(row.id)));
  }

  async searchAirports(query: string): Promise<AirportSuggestion[]> {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    return (await this.repository.searchAirports(normalized)).map(({ code, name, city, country }) => ({
      code, name, city, country,
    }));
  }

  isBookable(flight: FlightInfo, now = new Date()): boolean {
    return isBookable(flight, now);
  }

  priceParty(flight: FlightInfo, cabin: Cabin, party: PassengerMix): PriceQuote {
    return priceParty(flight, cabin, party);
  }

  async changeStatus(id: string, next: FlightStatus, estimatedDepartureUtc?: Date, cancelReason?: string) {
    const flight = await this.repository.getFlight(id);
    if (!flight) throw new NotFoundException('Flight not found');
    const current = FlightStatusValue.of(flight.status);
    const nextValue = FlightStatusValue.of(next);
    current.transitionTo(nextValue);
    flight.status = nextValue.value;
    flight.estimatedDepartureUtc = estimatedDepartureUtc ?? flight.estimatedDepartureUtc;
    flight.cancelReason = nextValue.value === FlightStatus.Cancelled ? cancelReason ?? null : null;
    await this.repository.saveFlight(flight);
    return current.value;
  }

  async setFare(flightId: string, cabin: Cabin, money: Money) {
    if (money.amount <= 0 || !/^[A-Z]{3}$/.test(money.currency)) {
      throw new UnprocessableEntityException('Fare must be positive and use a three-letter currency');
    }
    if (!(await this.repository.getFlight(flightId))) throw new NotFoundException('Flight not found');
    const fare = new FlightFareEntity();
    fare.flightId = flightId;
    fare.cabin = cabin;
    fare.amount = money.amount;
    fare.currency = money.currency;
    await this.repository.saveFare(fare);
    return money;
  }

  async createFlight(input: {
    flightNumber: string; airlineCode: string; originCode: string; destinationCode: string;
    scheduledDepartureUtc: Date; scheduledArrivalUtc: Date;
  }) {
    const origin = AirportCode.of(input.originCode);
    const destination = AirportCode.of(input.destinationCode);
    FlightNumber.of(input.flightNumber);
    if (origin.equals(destination)) throw new UnprocessableEntityException('Origin and destination must differ');
    if (input.scheduledArrivalUtc <= input.scheduledDepartureUtc) {
      throw new UnprocessableEntityException('Arrival must be after departure');
    }
    if (input.scheduledDepartureUtc <= new Date()) {
      throw new UnprocessableEntityException('Departure must be in the future');
    }
    const flight = Object.assign(new FlightEntity(), input, {
      originCode: origin.value,
      destinationCode: destination.value,
      status: FlightStatus.Scheduled,
      estimatedDepartureUtc: null,
      cancelReason: null,
    });
    const saved = await this.repository.saveFlight(flight);
    return saved.id;
  }

  async upsertAirport(input: { code: string; name: string; city: string; country: string; timezone: string }) {
    const airport = Object.assign(new AirportEntity(), input, {
      code: AirportCode.of(input.code).value,
    });
    return (await this.repository.saveAirport(airport)).code;
  }
}
