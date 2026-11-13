import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../shared/api-docs';
import { AppError } from '../../shared/errors';
import {
  SEARCH_API,
  type ResultPage,
  type RoundTripPage,
  type SearchApi,
  type SearchError,
} from './search-api';
import {
  OneWaySearchQuery,
  RoundTripSearchQuery,
  toOneWayCriteria,
  toRoundTripCriteria,
} from './search.dto';

/** How each expected Search failure is reported. Every one is a 400. */
const MESSAGES: Record<SearchError, string> = {
  SAME_AIRPORT: 'Origin and destination must be different airports.',
  UNKNOWN_AIRPORT: 'The origin or destination airport is not known.',
  INVALID_DATE: 'The date is not a real calendar date.',
  DATE_IN_PAST: 'The departure date is in the past at the origin airport.',
  INVALID_PASSENGERS:
    'Choose 1 to 9 adults and children in total, with no more infants than adults.',
  UNSUPPORTED_SORT: 'Sort must be one of: ',
  INVALID_PAGE: 'The page number must be 1 or more.',
  INVALID_PAGE_SIZE: 'The page size must be 1 or more.',
  INVALID_FILTER: 'The departure window must end at or after its start.',
  RETURN_BEFORE_OUTBOUND: 'The return date must not be before the departure date.',
};

/** The query field each failure belongs beside, so the form can show it there (NFR-USAB-01). */
const FIELDS: Partial<Record<SearchError, string>> = {
  SAME_AIRPORT: 'destination',
  INVALID_DATE: 'date',
  DATE_IN_PAST: 'date',
  INVALID_PASSENGERS: 'adults',
  UNSUPPORTED_SORT: 'sort',
  INVALID_PAGE: 'page',
  INVALID_PAGE_SIZE: 'pageSize',
  INVALID_FILTER: 'departTo',
  RETURN_BEFORE_OUTBOUND: 'returnDate',
};

const BAD_REQUEST = 'Invalid criteria, in the shared error shape with field errors.';

/**
 * Public search routes (no sign-in). Each one only parses the query into typed criteria, calls
 * the Search facade and maps an expected failure to a 400.
 */
@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(@Inject(SEARCH_API) private readonly search: SearchApi) {}

  /** US-FS-01 to 05: one-way search, filtered, sorted and paged. */
  @Get('flights')
  @ApiOperation({ summary: 'Search one-way flights for a party' })
  @ApiOkResponse({ description: 'One page of bookable, priced flights; empty when none match.' })
  @ApiBadRequestResponse({ description: BAD_REQUEST, type: ErrorResponse })
  async searchOneWay(@Query() query: OneWaySearchQuery): Promise<ResultPage> {
    const result = await this.search.searchOneWay(toOneWayCriteria(query));
    if (!result.ok) throw this.failed(result.error);
    return result.value;
  }

  /** US-FS-06: both legs as two independently sorted and paged lists. */
  @Get('round-trip')
  @ApiOperation({ summary: 'Search outbound and return flights together' })
  @ApiOkResponse({ description: 'Two pages: outbound and inbound.' })
  @ApiBadRequestResponse({ description: BAD_REQUEST, type: ErrorResponse })
  async searchRoundTrip(@Query() query: RoundTripSearchQuery): Promise<RoundTripPage> {
    const result = await this.search.searchRoundTrip(toRoundTripCriteria(query));
    if (!result.ok) throw this.failed(result.error);
    return result.value;
  }

  private failed(code: SearchError): AppError {
    const message =
      code === 'UNSUPPORTED_SORT'
        ? `${MESSAGES[code]}${this.search.sortKeys().join(', ')}.`
        : MESSAGES[code];
    const field = FIELDS[code];
    return AppError.badRequest(code, message, field ? { [field]: message } : undefined);
  }
}
