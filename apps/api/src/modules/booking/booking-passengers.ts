import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { Tx } from '../../shared/db';
import { BookingPassengerEntity } from './booking-passenger.entity';
import { BookingEntity } from './booking.entity';

/** The manifest's source: every passenger on the paid bookings of a flight. */
@Injectable()
export class BookingPassengers {
  async confirmedFlight(tx: Tx, flightId: string) {
    const bookings = await tx.find(BookingEntity, {
      where: { flightId, status: In(['CONFIRMED', 'TICKETED']) },
    });
    if (bookings.length === 0) return [];
    const passengers = await tx.find(BookingPassengerEntity, {
      where: { bookingId: In(bookings.map((booking) => booking.id)) },
      order: { position: 'ASC' },
    });
    const byBooking = new Map(bookings.map((booking) => [booking.id, booking]));
    return passengers.map((passenger) => {
      const booking = byBooking.get(passenger.bookingId)!;
      return {
        id: booking.id,
        /** Ticketing's tickets name this passenger, so the manifest can match each one. */
        passengerId: passenger.id,
        reference: booking.reference,
        passengerName: `${passenger.firstName} ${passenger.lastName}`.trim(),
        status: booking.status,
      };
    });
  }
}
