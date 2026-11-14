import { Inject, Injectable } from '@nestjs/common';
import { BOOKINGS_ON_FLIGHTS, type BookingsOnFlights } from '../booking/index';
import { CATALOG_API, type CatalogApi } from '../flight-catalog/index';
import type { DepartureSource, UpcomingDeparture } from './departure-source';

/**
 * Adapter pattern, Adapter: gives the reminder job the DepartureSource it expects (the Target) by
 * translating from two APIs it does not speak (the Adaptees): the Catalog's flights departing in a
 * window, and Booking's bookings on those flights. One UpcomingDeparture per booking per leg, so
 * each leg of a round trip is reminded before it leaves.
 */
@Injectable()
export class BookedDeparturesAdapter implements DepartureSource {
  constructor(
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(BOOKINGS_ON_FLIGHTS) private readonly bookings: BookingsOnFlights,
  ) {}

  async ticketedDeparturesBetween(from: Date, to: Date): Promise<UpcomingDeparture[]> {
    const flights = new Map(
      (await this.catalog.departingBetween(from, to)).map((flight) => [flight.id, flight]),
    );
    const legs = await this.bookings.onFlights([...flights.keys()]);
    return legs.flatMap((leg) => {
      const flight = flights.get(leg.flightId);
      if (!flight) return [];
      return [
        {
          bookingId: leg.bookingId,
          ownerId: leg.ownerId,
          ref: leg.reference,
          flightNumber: flight.flightNumber,
          departureUtc: flight.scheduledDepartureUtc.toISOString(),
          departureTimeZone: flight.origin.timezone,
          bookingStatus: leg.status,
          flightStatus: flight.status,
        },
      ];
    });
  }
}
