import { Controller, Get, Param, Query } from '@nestjs/common';
import { AirportCode } from './flight-catalog.domain';
import { AirportSearchQuery, FlightRouteQuery } from './flight-catalog.dto';
import { FlightCatalogService } from './flight-catalog.service';

@Controller('flights')
export class FlightCatalogController {
  constructor(private readonly service: FlightCatalogService) {}

  @Get()
  findFlights(
    @Query() query: FlightRouteQuery,
  ) {
    return this.service.findFlights(
      { origin: AirportCode.of(query.origin), destination: AirportCode.of(query.destination) },
      query.date,
    );
  }

  @Get('airports/suggestions')
  searchAirports(@Query() query: AirportSearchQuery) {
    return this.service.searchAirports(query.q);
  }

  @Get(':id')
  getFlight(@Param('id') id: string) {
    return this.service.getFlight(id);
  }
}
