import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not } from 'typeorm';
import { type Money, money } from '../../shared/money';
import { CLOCK, type Clock } from '../../shared/time';
import { CATALOG_API, type CatalogApi, type FlightInfo } from '../flight-catalog/index';
import { type BookingView, loadView } from './booking-view';
import { BookingEntity } from './booking.entity';
import type { BookingStatus } from './booking-state';

export interface ListOptions {
  /** Abandoned checkouts clutter the list, so expired bookings are hidden unless asked for. */
  includeExpired?: boolean;
}

export interface BookingSummary {
  reference: string;
  route: { origin: string; destination: string };
  departureLocal: string;
  status: BookingStatus;
  total: Money;
}

export interface MyBookings {
  upcoming: BookingSummary[];
  past: BookingSummary[];
}

/** Read side of Booking: US-BK-04 (retrieve by reference) and US-BK-06 (list my bookings). */
@Injectable()
export class BookingQueries {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The owner's booking. Someone else's reference answers exactly like an unknown one: null. */
  async getOwned(reference: string, ownerId: string): Promise<BookingView | null> {
    const booking = await this.db.manager.findOneBy(BookingEntity, {
      reference: reference.toUpperCase(),
      ownerId,
    });
    return booking ? loadView(this.db.manager, booking) : null;
  }

  async listMine(ownerId: string, options: ListOptions = {}): Promise<MyBookings> {
    const bookings = await this.db.manager.find(BookingEntity, {
      where: {
        ownerId,
        ...(options.includeExpired ? {} : { status: Not('EXPIRED') }),
      },
    });
    const flightIds = [...new Set(bookings.map((booking) => booking.flightId))];
    const flights = new Map<string, FlightInfo>();
    await Promise.all(
      flightIds.map(async (id) => {
        const flight = await this.catalog.getFlight(id);
        if (flight) flights.set(id, flight);
      }),
    );

    const now = this.clock.now().getTime();
    const entries = bookings.flatMap((booking) => {
      const flight = flights.get(booking.flightId);
      if (!flight) return [];
      const summary: BookingSummary = {
        reference: booking.reference,
        route: { origin: flight.origin.code, destination: flight.destination.code },
        departureLocal: flight.scheduledDepartureLocal,
        status: booking.status,
        total: money(booking.amountMinor, booking.currency),
      };
      return [{ summary, departure: flight.scheduledDepartureUtc.getTime() }];
    });
    const upcoming = entries
      .filter((entry) => entry.departure >= now)
      .sort((a, b) => a.departure - b.departure);
    const past = entries
      .filter((entry) => entry.departure < now)
      .sort((a, b) => b.departure - a.departure);
    return { upcoming: upcoming.map((e) => e.summary), past: past.map((e) => e.summary) };
  }
}
