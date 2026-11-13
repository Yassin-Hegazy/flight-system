import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketingModule } from '../ticketing/index';
import { AuditLog } from './audit-log';
import { AuditEntry } from './audit-log.entity';
import { AdministrationOperationsController } from './administration-operations.controller';
import { BookingModule } from '../booking/index';
import { FlightCatalogModule } from '../flight-catalog/index';
import { InventoryModule } from '../inventory/index';
import { AdministrationController } from './administration.controller';
import { CommandBus } from './command-bus';

@Module({
  // The receivers of the commands: Administration changes nothing itself, it asks these modules.
  imports: [
    FlightCatalogModule,
    InventoryModule,
    BookingModule,
    TicketingModule,
    TypeOrmModule.forFeature([AuditEntry]),
  ],
  controllers: [AdministrationController, AdministrationOperationsController],
  providers: [CommandBus, AuditLog],
})
export class AdministrationModule {}
