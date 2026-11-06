import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirlineEntity } from './airline.entity';
import { AirportEntity } from './airport.entity';
import { FlightFareEntity } from './flight-fare.entity';
import { FlightEntity } from './flight.entity';
import { FlightCatalogController } from './flight-catalog.controller';
import { FlightCatalogRepository } from './flight-catalog.repository';
import { FlightCatalogService } from './flight-catalog.service';

@Module({
  imports: [TypeOrmModule.forFeature([AirlineEntity, AirportEntity, FlightEntity, FlightFareEntity])],
  controllers: [FlightCatalogController],
  providers: [FlightCatalogRepository, FlightCatalogService],
  exports: [FlightCatalogService],
})
export class FlightCatalogModule {}
