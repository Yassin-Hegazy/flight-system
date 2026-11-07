import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CLOCK, systemClock } from '../../shared/time';
import { AirlineEntity } from './airline.entity';
import { AirportEntity } from './airport.entity';
import { CATALOG_API } from './catalog-api';
import { CATALOG_REPOSITORY } from './catalog.repository';
import { FlightCatalogController } from './flight-catalog.controller';
import { FlightCatalogService } from './flight-catalog.service';
import { FlightFareEntity } from './flight-fare.entity';
import { FlightEntity } from './flight.entity';
import { PgCatalogRepository } from './pg-catalog.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([AirlineEntity, AirportEntity, FlightEntity, FlightFareEntity]),
  ],
  controllers: [FlightCatalogController],
  providers: [
    FlightCatalogService,
    { provide: CATALOG_REPOSITORY, useClass: PgCatalogRepository },
    { provide: CATALOG_API, useExisting: FlightCatalogService },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [CATALOG_API],
})
export class FlightCatalogModule {}
