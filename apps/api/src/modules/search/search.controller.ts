import { Controller, Get, Inject, Query } from '@nestjs/common';
import { SEARCH_API, type ResultPage, type RoundTripPage, type SearchApi } from './search-api';
import { OneWaySearchQuery, RoundTripSearchQuery } from './search.dto';

/** Public search routes. */
@Controller('search')
export class SearchController {
  constructor(@Inject(SEARCH_API) private readonly search: SearchApi) {}

  @Get('flights')
  searchOneWay(@Query() query: OneWaySearchQuery): Promise<ResultPage> {
    void this.search;
    return Promise.reject(new Error(`Not implemented: GET /search/flights ${query.origin}`));
  }

  @Get('round-trip')
  searchRoundTrip(@Query() query: RoundTripSearchQuery): Promise<RoundTripPage> {
    return Promise.reject(new Error(`Not implemented: GET /search/round-trip ${query.origin}`));
  }
}
