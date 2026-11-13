import { Module } from '@nestjs/common';
import { BOOKING_OWNERS, NoBookingsYet } from './booking-owners';

@Module({
  providers: [{ provide: BOOKING_OWNERS, useClass: NoBookingsYet }],
  exports: [BOOKING_OWNERS],
})
export class BookingModule {}
