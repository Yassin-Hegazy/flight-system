import { Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import { In } from 'typeorm';
import { BookingEntity } from './booking.entity';

@Injectable()
export class BookingPassengers {
  async confirmedFlight(tx: Tx, flightId: string) {
    const bookings = await tx.findBy(BookingEntity, {
      flightId,
      status: In(['CONFIRMED', 'TICKETED']),
    });
    return bookings.map(({ id, reference, passengerName, status }) => ({
      id,
      reference,
      passengerName,
      status,
    }));
  }
}
