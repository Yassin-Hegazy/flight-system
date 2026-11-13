import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlightCatalogModule } from '../flight-catalog/index';
import { InventoryModule } from '../inventory/index';
import { BOOKING_OWNERS } from './booking-owners';
import { BOOKING_PAYMENTS } from './booking-payments';
import { BookingController } from './booking.controller';
import { BookingEntity } from './booking.entity';
import { BookingService } from './booking.service';

@Module({
  imports: [FlightCatalogModule, InventoryModule, TypeOrmModule.forFeature([BookingEntity])],
  controllers: [BookingController],
  providers: [
    BookingService,
    { provide: BOOKING_PAYMENTS, useExisting: BookingService },
    { provide: BOOKING_OWNERS, useExisting: BookingService },
  ],
  exports: [BOOKING_OWNERS, BOOKING_PAYMENTS],
})
export class BookingModule {}
