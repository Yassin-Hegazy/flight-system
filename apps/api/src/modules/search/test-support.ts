// Test helpers for Search's unit tests. Not exported from index.ts.
import { money } from '../../shared/money';
import { err, ok, type Result } from '../../shared/result';
import { type Clock, formatLocal, localDateOf } from '../../shared/time';
import {
  AirportCode,
  type AirportInfo,
  type AirportSuggestion,
  type Cabin,
  type CatalogApi,
  type FlightInfo,
  FlightStatus,
  type PassengerMix,
  type PriceLine,
  type PriceQuote,
  type PricingError,
  type Route,
} from '../flight-catalog/index';
import type { Availability, AvailabilityError, AvailabilityRequest } from '../inventory/index';
import type { InventoryApi } from '../inventory/index';
import type { OneWayCriteria, SearchResult } from './search-api';

export const CAIRO: AirportInfo = {
  code: 'CAI',
  name: 'Cairo International',
  city: 'Cairo',
  timezone: 'Africa/Cairo',
};

export const HEATHROW: AirportInfo = {
  code: 'LHR',
  name: 'Heathrow',
  city: 'London',
  timezone: 'Europe/London',
};

/**
 * 23:00 UTC on 9 December is 01:00 on 10 December in Cairo (UTC+2): the UTC date and the Cairo
 * date differ, so a test using it shows which zone "today" was judged in.
 */
export const NOW = new Date('2026-12-09T23:00:00Z');

export const fixedClock = (now: Date = NOW): Clock => ({ now: () => now });

export interface ResultSpec {
  flight?: string;
  total?: number;
  /** UTC instant, e.g. 2026-12-10T09:00Z. */
  departs?: string;
  durationMinutes?: number;
  /** Local departure as stored by the Catalog, e.g. 2026-12-10T11:00+02:00. */
  departureLocal?: string;
  airline?: string;
}

/** A SearchResult with only the fields a test cares about spelled out. */
export function result(spec: ResultSpec = {}): SearchResult {
  const flightNumber = spec.flight ?? 'MS777';
  const departureUtc = new Date(spec.departs ?? '2026-12-10T09:00Z');
  const durationMinutes = spec.durationMinutes ?? 300;
  const arrivalUtc = new Date(departureUtc.getTime() + durationMinutes * 60_000);
  const total = money(spec.total ?? 10000, 'EGP');
  const airlineCode = spec.airline ?? flightNumber.slice(0, 2);
  return {
    flightId: `id-${flightNumber}-${departureUtc.toISOString()}`,
    flightNumber,
    airline: { code: airlineCode, name: airlineCode },
    origin: CAIRO,
    destination: HEATHROW,
    departureLocal: spec.departureLocal ?? '2026-12-10T11:00+02:00',
    arrivalLocal: '2026-12-10T14:00+00:00',
    departureUtc,
    arrivalUtc,
    status: FlightStatus.Scheduled,
    durationMinutes,
    stops: 0,
    cabin: 'ECONOMY',
    adultFare: total,
    total,
    breakdown: [{ passengerType: 'ADULT', count: 1, unitPrice: total, amount: total }],
  };
}

/** A small deterministic pseudo-random generator, so property-style tests repeat exactly. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

export interface FlightSpec {
  id?: string;
  number?: string;
  airlineName?: string;
  origin?: AirportInfo;
  destination?: AirportInfo;
  /** UTC instant of the scheduled departure. */
  departs?: string;
  durationMinutes?: number;
  status?: FlightStatus;
  /** UTC instant of the estimated departure (DELAYED only). */
  estimated?: string;
  /** Adult fare per cabin in minor units; a cabin left out has no fare. */
  fares?: Partial<Record<Cabin, number>>;
}

/** A FlightInfo as the Catalog would describe it. */
const FLIGHT_DEFAULTS = {
  number: 'MS777',
  origin: CAIRO,
  destination: HEATHROW,
  departs: '2026-12-10T07:00:00Z',
  durationMinutes: 300,
  fares: { ECONOMY: 10000, BUSINESS: 40000 } as Partial<Record<Cabin, number>>,
  status: FlightStatus.Scheduled,
  airlineName: 'EgyptAir',
};

export function flight(spec: FlightSpec = {}): FlightInfo {
  const {
    number: flightNumber,
    origin,
    destination,
    departs,
    durationMinutes,
    fares,
    status,
    airlineName,
  } = { ...FLIGHT_DEFAULTS, ...spec };
  const departure = new Date(departs);
  const arrival = new Date(departure.getTime() + durationMinutes * 60_000);
  const info: FlightInfo = {
    id: spec.id ?? `flight-${flightNumber}-${departure.toISOString()}`,
    flightNumber,
    airline: { code: flightNumber.slice(0, 2), name: airlineName },
    origin,
    destination,
    scheduledDepartureUtc: departure,
    scheduledArrivalUtc: arrival,
    scheduledDepartureLocal: formatLocal(departure, origin.timezone),
    scheduledArrivalLocal: formatLocal(arrival, destination.timezone),
    durationMinutes,
    status,
    fares: Object.fromEntries(
      Object.entries(fares).map(([cabin, amount]) => [cabin, money(amount, 'EGP')]),
    ),
  };
  if (spec.estimated) {
    info.estimatedDepartureUtc = new Date(spec.estimated);
    info.estimatedDepartureLocal = formatLocal(info.estimatedDepartureUtc, origin.timezone);
  }
  return info;
}

const unused = (name: string) => () => Promise.reject(new Error(`Search must not call ${name}`));

const PERCENT: Record<PriceLine['passengerType'], number> = { ADULT: 100, CHILD: 75, INFANT: 10 };
const BOOKING_CUTOFF_MS = 2 * 60 * 60 * 1000;

/**
 * A hand-written CatalogApi. Its reads behave like the real Catalog's (route and local day,
 * SCHEDULED or DELAYED more than 2 h out, adults 100% / children 75% / infants 10%), so the
 * pipeline can be tested without a database. Writes are never used by Search and reject.
 */
export class CatalogStub implements CatalogApi {
  constructor(
    private readonly flights: FlightInfo[] = [],
    private readonly airports: AirportInfo[] = [CAIRO, HEATHROW],
  ) {}

  getAirports(codes: readonly string[]): Promise<AirportInfo[]> {
    return Promise.resolve(this.airports.filter((airport) => codes.includes(airport.code)));
  }

  findFlights(route: Route, localDate: string): Promise<FlightInfo[]> {
    return Promise.resolve(
      this.flights.filter(
        (info) =>
          info.origin.code === route.origin.value &&
          info.destination.code === route.destination.value &&
          localDateOf(info.scheduledDepartureUtc, info.origin.timezone) === localDate,
      ),
    );
  }

  isBookable(info: FlightInfo, now: Date): boolean {
    if (info.status !== FlightStatus.Scheduled && info.status !== FlightStatus.Delayed) {
      return false;
    }
    const departure = info.estimatedDepartureUtc ?? info.scheduledDepartureUtc;
    return departure.getTime() - now.getTime() > BOOKING_CUTOFF_MS;
  }

  priceParty(
    info: FlightInfo,
    cabin: Cabin,
    party: PassengerMix,
  ): Result<PriceQuote, PricingError> {
    const adultFare = info.fares[cabin];
    if (!adultFare) return err('NO_FARE');
    const counts = { ADULT: party.adults, CHILD: party.children ?? 0, INFANT: party.infants ?? 0 };
    const lines: PriceLine[] = (['ADULT', 'CHILD', 'INFANT'] as const)
      .filter((type) => counts[type] > 0)
      .map((passengerType) => {
        const unitPrice = money(
          Math.round((adultFare.amountMinor * PERCENT[passengerType]) / 100),
          adultFare.currency,
        );
        const count = counts[passengerType];
        return {
          passengerType,
          count,
          unitPrice,
          amount: money(unitPrice.amountMinor * count, unitPrice.currency),
        };
      });
    const total = money(
      lines.reduce((sum, line) => sum + line.amount.amountMinor, 0),
      adultFare.currency,
    );
    return ok({ cabin, total, lines });
  }

  searchAirports = unused('searchAirports') as () => Promise<AirportSuggestion[]>;
  getFlight = unused('getFlight');
  getFlightForUpdate = unused('getFlightForUpdate');
  createFlight = unused('createFlight');
  changeStatus = unused('changeStatus');
  setFare = unused('setFare');
  upsertAirport = unused('upsertAirport');
}

/**
 * A hand-written InventoryApi: `seats` maps a flight ID to the seats left in any cabin. A flight
 * missing from the map has no inventory, unless `defaultSeats` is given. Infants take no seat.
 */
export class InventoryStub implements InventoryApi {
  constructor(
    private readonly seats: Record<string, number> = {},
    private readonly defaultSeats?: number,
  ) {}

  checkAvailability(
    requests: readonly AvailabilityRequest[],
  ): Promise<Result<Availability[], AvailabilityError>> {
    return Promise.resolve(
      ok(
        requests.map((request) => {
          const available = this.seats[request.flightId] ?? this.defaultSeats;
          const required = request.passengers.adults + (request.passengers.children ?? 0);
          return {
            flightId: request.flightId,
            cabin: request.cabin,
            availableSeats: available ?? 0,
            requiredSeats: required,
            canAccommodate: available !== undefined && available >= required,
            inventoryFound: available !== undefined,
          };
        }),
      ),
    );
  }

  hold = unused('hold');
  commit = unused('commit');
  release = unused('release');
  validateForPayment = unused('validateForPayment');
  setCapacity = unused('setCapacity');
  cabinLoad = unused('cabinLoad');
}

/** Cairo to London on 10 December, one adult, Economy; override what a test is about. */
export function criteria(overrides: Partial<OneWayCriteria> = {}): OneWayCriteria {
  return {
    origin: AirportCode.of('CAI'),
    destination: AirportCode.of('LHR'),
    date: '2026-12-10',
    passengers: { adults: 1 },
    cabin: 'ECONOMY',
    ...overrides,
  };
}
