import type { FlightInfo, PriceQuote } from '../flight-catalog/index';
import type { SearchResult } from './search-api';

/** Direct flights only until connections exist (US-FS-08, Stretch). */
const DIRECT = 0;

/**
 * Maps a Catalog flight and its party quote to one comparison row (US-FS-02 AC-1). Copies, never
 * computes: the total and the breakdown are the Catalog's quote as given.
 */
export function toSearchResult(flight: FlightInfo, quote: PriceQuote): SearchResult {
  const adultFare = flight.fares[quote.cabin];
  if (!adultFare) throw new Error(`Flight ${flight.id} was priced in a cabin with no fare`);
  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    airline: { code: flight.airline.code, name: flight.airline.name },
    origin: flight.origin,
    destination: flight.destination,
    departureLocal: flight.scheduledDepartureLocal,
    arrivalLocal: flight.scheduledArrivalLocal,
    departureUtc: flight.scheduledDepartureUtc,
    arrivalUtc: flight.scheduledArrivalUtc,
    ...estimateOf(flight),
    status: flight.status,
    durationMinutes: flight.durationMinutes,
    stops: DIRECT,
    cabin: quote.cabin,
    adultFare,
    total: quote.total,
    breakdown: quote.lines,
  };
}

/** The estimated departure of a DELAYED flight, shown beside the scheduled one. */
function estimateOf(
  flight: FlightInfo,
): Pick<SearchResult, 'estimatedDepartureLocal' | 'estimatedDepartureUtc'> {
  if (!flight.estimatedDepartureUtc || !flight.estimatedDepartureLocal) return {};
  return {
    estimatedDepartureLocal: flight.estimatedDepartureLocal,
    estimatedDepartureUtc: flight.estimatedDepartureUtc,
  };
}
