import type { SearchResult, SortKey } from '../search-api';

/**
 * «Strategy»: one interchangeable way of ordering search results. The search use case holds a
 * strategy picked by key and calls `compare`; it never knows which criterion it is sorting by.
 */
export interface SortStrategy {
  readonly key: SortKey;
  compare(a: SearchResult, b: SearchResult): number;
}

/** Injection token for the list of registered strategies (see search.module.ts). */
export const SORT_STRATEGIES = Symbol('SORT_STRATEGIES');

/**
 * The shared tie-break (US-FS-02 AC-4): departure instant, then flight number. Without it,
 * equal-priced flights come back in engine order, tests flake and pages repeat or skip flights.
 */
export function tieBreak(a: SearchResult, b: SearchResult): number {
  return (
    a.departureUtc.getTime() - b.departureUtc.getTime() ||
    compareText(a.flightNumber, b.flightNumber)
  );
}

/** Code-unit order, so the result never depends on the server's locale. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
