import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/index';
import { FlightCatalogModule } from '../flight-catalog/index';
import { InventoryModule } from '../inventory/index';
import { AdministrationController } from './administration.controller';
import { CommandBus } from './command-bus';

@Module({
  // The receivers of the commands: Administration changes nothing itself, it asks these modules.
  imports: [FlightCatalogModule, InventoryModule, BookingModule],
  controllers: [AdministrationController],
  providers: [CommandBus],
})
export class AdministrationModule {}
