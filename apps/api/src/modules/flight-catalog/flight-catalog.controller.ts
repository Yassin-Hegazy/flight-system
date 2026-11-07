import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AppError } from '../../shared/errors';
import {
  CATALOG_API,
  type AirportSuggestion,
  type CatalogApi,
  type FlightInfo,
} from './catalog-api';
import { AirportSearchQuery, FlightRouteQuery } from './flight-catalog.dto';
import { AirportCode, Route } from './value-objects';

const ID_PIPE = new ParseUUIDPipe({
  exceptionFactory: () => AppError.badRequest('INVALID_FLIGHT_ID', 'Flight ID must be a UUID.'),
});

/** Public read routes. Each one parses its input, calls one use case and maps the result. */
@Controller('flights')
export class FlightCatalogController {
  constructor(@Inject(CATALOG_API) private readonly catalog: CatalogApi) {}

  @Get()
  findFlights(@Query() query: FlightRouteQuery): Promise<FlightInfo[]> {
    const route = Route.between(AirportCode.of(query.origin), AirportCode.of(query.destination));
    if (!route.ok) {
      throw AppError.badRequest(
        'SAME_AIRPORT',
        'Origin and destination must be different airports.',
      );
    }
    return this.catalog.findFlights(route.value, query.date);
  }

  @Get('airports/suggestions')
  searchAirports(@Query() query: AirportSearchQuery): Promise<AirportSuggestion[]> {
    return this.catalog.searchAirports(query.q);
  }

  @Get(':id')
  async getFlight(@Param('id', ID_PIPE) id: string): Promise<FlightInfo> {
    const flight = await this.catalog.getFlight(id);
    if (!flight) throw AppError.notFound('FLIGHT_NOT_FOUND', 'Flight not found.');
    return flight;
  }
}
