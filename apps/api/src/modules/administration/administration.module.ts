import { Module } from '@nestjs/common';
import { FlightCatalogModule } from '../flight-catalog/index';
import { InventoryModule } from '../inventory/index';
import { AdministrationController } from './administration.controller';
import { BOOKING_OWNERS, NoBookingsYet } from './booking-owners';
import { CommandBus } from './command-bus';

@Module({
  // The receivers of the commands: Administration changes nothing itself, it asks these modules.
  imports: [FlightCatalogModule, InventoryModule],
  controllers: [AdministrationController],
  providers: [
    CommandBus,
    // Replace with an adapter over Booking's API when the Booking module exists.
    { provide: BOOKING_OWNERS, useClass: NoBookingsYet },
  ],
})
export class AdministrationModule {}
