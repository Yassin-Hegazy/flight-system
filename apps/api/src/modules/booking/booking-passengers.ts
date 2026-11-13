import { Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db';
import { BookingEntity } from './booking.entity';

@Injectable()
export class BookingPassengers {
  async confirmedFlight(tx: Tx, flightId: string) {
    const bookings = await tx.findBy(BookingEntity, { flightId, status: 'CONFIRMED' });
    return bookings.map(({ id, reference, passengerName, status }) => ({
      id,
      reference,
      passengerName,
      status,
    }));
  }
}
