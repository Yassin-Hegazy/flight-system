import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CLOCK, systemClock } from '../../shared/time';
import { CabinInventoryEntity } from './cabin-inventory.entity';
import { INVENTORY_API } from './inventory-api';
import { InventoryFacade } from './inventory.facade';
import { INVENTORY_REPOSITORY } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { PgInventoryRepository } from './pg-inventory.repository';
import { SeatHoldEntity } from './seat-hold.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CabinInventoryEntity, SeatHoldEntity])],
  providers: [
    InventoryService,
    InventoryFacade,
    { provide: INVENTORY_API, useExisting: InventoryFacade },
    { provide: INVENTORY_REPOSITORY, useClass: PgInventoryRepository },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [INVENTORY_API, InventoryFacade],
})
export class InventoryModule {}
