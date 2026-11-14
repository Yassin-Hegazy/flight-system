import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { BookingEntity, type BookingStatus } from './booking.entity';
import { BookingSegmentEntity } from './booking-segment.entity';

/** One booking's leg on a flight, as a module outside Booking may see it. */
export interface FlightBooking {
  bookingId: string;
  reference: string;
  ownerId: string;
  status: BookingStatus;
  flightId: string;
}

/** The part of Booking's public API that lists who is booked on given flights, for reminders. */
export interface BookingsOnFlights {
  /** Every booking with a leg on one of these flights, one entry per leg, whatever its status. */
  onFlights(flightIds: readonly string[]): Promise<FlightBooking[]>;
}

export const BOOKINGS_ON_FLIGHTS = Symbol('BOOKINGS_ON_FLIGHTS');

@Injectable()
export class BookingsOnFlightsQuery implements BookingsOnFlights {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async onFlights(flightIds: readonly string[]): Promise<FlightBooking[]> {
    if (flightIds.length === 0) return [];
    const segments = await this.db.manager.findBy(BookingSegmentEntity, {
      flightId: In([...flightIds]),
    });
    if (segments.length === 0) return [];
    const bookings = await this.db.manager.findBy(BookingEntity, {
      id: In([...new Set(segments.map((segment) => segment.bookingId))]),
    });
    const byId = new Map(bookings.map((booking) => [booking.id, booking]));
    return segments.flatMap((segment) => {
      const booking = byId.get(segment.bookingId);
      if (!booking) return [];
      return [
        {
          bookingId: booking.id,
          reference: booking.reference,
          ownerId: booking.ownerId,
          status: booking.status,
          flightId: segment.flightId,
        },
      ];
    });
  }
}
