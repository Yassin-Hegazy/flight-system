import { err, ok, type Result } from '../../shared/result';
import { isLocalDate, localDateOf } from '../../shared/time';
import { type AirportInfo, type PassengerMix, Route } from '../flight-catalog/index';
import { type PageRequest, pageRequest } from './paginate';
import type { OneWayCriteria, SearchError } from './search-api';
import type { SortRegistry } from './sorting/sort-registry';
import type { SortStrategy } from './sorting/sort-strategy';

export const DEFAULT_SORT = 'PRICE';
/** Adults and children together: 1 to 9 (overview 4.3). Infants sit on a lap. */
export const MAX_SEATED_PASSENGERS = 9;

/** What step 1 hands the rest of the pipeline once the criteria are known to be valid. */
export interface CheckedCriteria extends PageRequest {
  route: Route;
  sort: SortStrategy;
}

/**
 * Step 1, the part that needs no data: shape and ranges of every criterion. Runs before any
 * query, so a bad request costs nothing.
 */
export function checkCriteria(
  criteria: OneWayCriteria,
  sorts: SortRegistry,
): Result<CheckedCriteria, SearchError> {
  const route = Route.between(criteria.origin, criteria.destination);
  if (!route.ok) return route;
  if (!isLocalDate(criteria.date)) return err('INVALID_DATE');
  if (!isValidParty(criteria.passengers)) return err('INVALID_PASSENGERS');
  const sort = sorts.get(criteria.sort ?? DEFAULT_SORT);
  if (!sort) return err('UNSUPPORTED_SORT');
  const paging = pageRequest(criteria.page, criteria.pageSize);
  if (!paging.ok) return paging;
  return ok({ route: route.value, sort, ...paging.value });
}

const isCount = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Whole numbers, 1 to 9 seated passengers, and no more infants than adults. */
export function isValidParty({ adults, children = 0, infants = 0 }: PassengerMix): boolean {
  if (![adults, children, infants].every(isCount)) return false;
  const seated = adults + children;
  return seated >= 1 && seated <= MAX_SEATED_PASSENGERS && infants <= adults;
}

/**
 * Step 1, the part that needs the airports: both must exist, and the date must not be before
 * today on the origin airport's clock (US-FS-01 AC-5, NFR-DATA-02). Today itself is accepted.
 */
export function checkAirportsAndDate(
  criteria: OneWayCriteria,
  airports: readonly AirportInfo[],
  now: Date,
): SearchError | null {
  const origin = airports.find((airport) => airport.code === criteria.origin.value);
  const destination = airports.find((airport) => airport.code === criteria.destination.value);
  if (!origin || !destination) return 'UNKNOWN_AIRPORT';
  // YYYY-MM-DD strings compare in calendar order.
  if (criteria.date < localDateOf(now, origin.timezone)) return 'DATE_IN_PAST';
  return null;
}
