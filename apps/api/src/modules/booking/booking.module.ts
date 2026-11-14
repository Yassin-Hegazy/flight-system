import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CLOCK, systemClock } from '../../shared/time';
import { FlightCatalogModule } from '../flight-catalog/index';
import { InventoryModule } from '../inventory/index';
import { BOOKING_OWNERS } from './booking-owners';
import { BOOKING_PAYMENTS } from './booking-payments';
import { BOOKING_TICKETING } from './booking-ticketing';
import { BookingExpiryJob } from './booking-expiry.job';
import { BookingHistoryEntity } from './booking-history.entity';
import { BookingIdempotencyEntity } from './booking-idempotency.entity';
import { BookingPassengerEntity } from './booking-passenger.entity';
import { BookingPassengers } from './booking-passengers';
import { BookingQueries } from './booking-queries';
import { BookingSegmentEntity } from './booking-segment.entity';
import { BookingController } from './booking.controller';
import { BookingEntity } from './booking.entity';
import { BookingService } from './booking.service';
import { CancelBookings, FLIGHT_BOOKING_CANCELLATION } from './cancel-bookings';
import { CreateBooking } from './create-booking';
import { BOOKING_EXPIRY, ExpireBookings } from './expire-bookings';

@Module({
  imports: [
    FlightCatalogModule,
    InventoryModule,
    TypeOrmModule.forFeature([
      BookingEntity,
      BookingSegmentEntity,
      BookingPassengerEntity,
      BookingHistoryEntity,
      BookingIdempotencyEntity,
    ]),
  ],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingQueries,
    BookingPassengers,
    CreateBooking,
    CancelBookings,
    ExpireBookings,
    BookingExpiryJob,
    { provide: CLOCK, useValue: systemClock },
    { provide: FLIGHT_BOOKING_CANCELLATION, useExisting: CancelBookings },
    { provide: BOOKING_EXPIRY, useExisting: ExpireBookings },
    { provide: BOOKING_PAYMENTS, useExisting: BookingService },
    { provide: BOOKING_OWNERS, useExisting: BookingService },
    { provide: BOOKING_TICKETING, useExisting: BookingService },
  ],
  exports: [
    BookingPassengers,
    BOOKING_OWNERS,
    BOOKING_PAYMENTS,
    BOOKING_TICKETING,
    BOOKING_EXPIRY,
    FLIGHT_BOOKING_CANCELLATION,
  ],
})
export class BookingModule {}
