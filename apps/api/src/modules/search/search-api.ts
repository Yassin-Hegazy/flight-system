import type { Money } from '../../shared/money';
import type { Result } from '../../shared/result';
import type {
  AirportCode,
  AirportInfo,
  Cabin,
  FlightStatus,
  PassengerMix,
  PriceLine,
} from '../flight-catalog/index';

/**
 * The name of a sort order. Supported keys are whatever strategies are registered (see
 * `SortRegistry.keys()`), so adding one never changes this type (Open/Closed).
 */
export type SortKey = string;

/** A local clock time at the origin airport, HH:mm (00:00 to 23:59). */
export type LocalTime = string;

/** US-FS-03: every filter is optional; the ones present combine with AND. */
export interface Filters {
  /** Highest acceptable party total, in integer minor units of the fare currency. */
  maxTotal?: number;
  /** Departure window at the origin airport, both bounds inclusive. */
  departureWindow?: { from: LocalTime; to: LocalTime };
  /** Two-letter airline codes; a flight by any one of them passes (OR). */
  airlines?: string[];
}

/** A one-way question, already shaped by the HTTP schema (pack section 2). */
export interface OneWayCriteria {
  origin: AirportCode;
  destination: AirportCode;
  /** The departure date at the origin airport, YYYY-MM-DD. */
  date: string;
  passengers: PassengerMix;
  cabin: Cabin;
  /** Defaults to PRICE. */
  sort?: SortKey;
  filters?: Filters;
  /** 1-based, defaults to 1. */
  page?: number;
  /** Defaults to 20; anything above 50 is capped to 50. */
  pageSize?: number;
}

/**
 * Two legs searched independently (US-FS-06 AC-2). Each leg has its own sort and page; the
 * filters and the page size apply to both legs.
 */
export interface RoundTripCriteria {
  origin: AirportCode;
  destination: AirportCode;
  date: string;
  returnDate: string;
  passengers: PassengerMix;
  cabin: Cabin;
  outboundSort?: SortKey;
  inboundSort?: SortKey;
  outboundPage?: number;
  inboundPage?: number;
  filters?: Filters;
  pageSize?: number;
}

/** One row of the comparison (US-FS-02 AC-1). Money stays in minor units; the UI formats it. */
export interface SearchResult {
  flightId: string;
  flightNumber: string;
  airline: { code: string; name: string };
  origin: AirportInfo;
  destination: AirportInfo;
  /** Scheduled times: local with the airport's offset, and the UTC instant. */
  departureLocal: string;
  arrivalLocal: string;
  departureUtc: Date;
  arrivalUtc: Date;
  /** Present while DELAYED, shown beside the scheduled departure, never instead of it. */
  estimatedDepartureLocal?: string;
  estimatedDepartureUtc?: Date;
  status: FlightStatus;
  durationMinutes: number;
  /** 0 for a direct flight. */
  stops: number;
  cabin: Cabin;
  /** One adult's fare in the requested cabin. */
  adultFare: Money;
  /** The whole party's price, from the Catalog's priceParty. */
  total: Money;
  /** One line per passenger type; the amounts add up to `total`. */
  breakdown: PriceLine[];
}

/** One page of a filtered, sorted result list (US-FS-05). */
export interface ResultPage {
  items: SearchResult[];
  page: number;
  pageSize: number;
  /** How many results passed the filters, across every page. */
  total: number;
  hasNext: boolean;
  sort: SortKey;
  /** The filters that were applied, echoed back (US-FS-03 AC-4). */
  filters: Filters;
}

export interface RoundTripPage {
  outbound: ResultPage;
  inbound: ResultPage;
}

/** Expected failures, each reported to the traveler as a 400. */
export type SearchError =
  | 'SAME_AIRPORT'
  | 'UNKNOWN_AIRPORT'
  | 'INVALID_DATE'
  | 'DATE_IN_PAST'
  | 'INVALID_PASSENGERS'
  | 'UNSUPPORTED_SORT'
  | 'INVALID_PAGE'
  | 'INVALID_PAGE_SIZE'
  | 'INVALID_FILTER'
  | 'RETURN_BEFORE_OUTBOUND';

/** Search's public boundary. Nothing is held: a result is a snapshot for display. */
export interface SearchApi {
  searchOneWay(criteria: OneWayCriteria): Promise<Result<ResultPage, SearchError>>;
  searchRoundTrip(criteria: RoundTripCriteria): Promise<Result<RoundTripPage, SearchError>>;
  /** The supported sort keys, for error messages and the UI. */
  sortKeys(): SortKey[];
}

/** Injection token: callers depend on the interface, never on the facade class. */
export const SEARCH_API = Symbol('SEARCH_API');
