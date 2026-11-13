import type { FlightInfo, PriceQuote } from '../flight-catalog/index';
import type { SearchResult } from './search-api';

/** Maps a Catalog flight and its party quote to one comparison row (US-FS-02 AC-1). */
export function toSearchResult(flight: FlightInfo, quote: PriceQuote): SearchResult {
  void quote;
  throw new Error(`Not implemented: toSearchResult(${flight.id})`);
}
