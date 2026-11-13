import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../shared/api-docs';
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
@ApiTags('Flight Catalog')
@Controller('flights')
export class FlightCatalogController {
  constructor(@Inject(CATALOG_API) private readonly catalog: CatalogApi) {}

  @Get()
  @ApiOperation({ summary: 'List flights on a route departing on a local day at the origin' })
  @ApiOkResponse({ description: 'Every flight on that route and day, any status, with fares.' })
  @ApiErrors(400)
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
  @ApiOperation({ summary: 'Suggest airports by code, name or city' })
  @ApiOkResponse({ description: 'Up to 10 airports, exact code matches first.' })
  @ApiErrors(400)
  searchAirports(@Query() query: AirportSearchQuery): Promise<AirportSuggestion[]> {
    return this.catalog.searchAirports(query.q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one flight' })
  @ApiOkResponse({ description: 'The flight with local times, status and fares.' })
  @ApiErrors(400, 404)
  async getFlight(@Param('id', ID_PIPE) id: string): Promise<FlightInfo> {
    const flight = await this.catalog.getFlight(id);
    if (!flight) throw AppError.notFound('FLIGHT_NOT_FOUND', 'Flight not found.');
    return flight;
  }
}
