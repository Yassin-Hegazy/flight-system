import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlightCatalogModule } from '../flight-catalog/index';
import { InventoryModule } from '../inventory/index';
import { BOOKING_OWNERS } from './booking-owners';
import { BOOKING_PAYMENTS } from './booking-payments';
import { BookingController } from './booking.controller';
import { BookingEntity } from './booking.entity';
import { CancelBookings, FLIGHT_BOOKING_CANCELLATION } from './cancel-bookings';
import { BookingService } from './booking.service';
import { BookingPassengers } from './booking-passengers';

@Module({
  imports: [FlightCatalogModule, InventoryModule, TypeOrmModule.forFeature([BookingEntity])],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingPassengers,
    CancelBookings,
    { provide: FLIGHT_BOOKING_CANCELLATION, useExisting: CancelBookings },
    { provide: BOOKING_PAYMENTS, useExisting: BookingService },
    { provide: BOOKING_OWNERS, useExisting: BookingService },
  ],
  exports: [BookingPassengers, BOOKING_OWNERS, BOOKING_PAYMENTS, FLIGHT_BOOKING_CANCELLATION],
})
export class BookingModule {}
