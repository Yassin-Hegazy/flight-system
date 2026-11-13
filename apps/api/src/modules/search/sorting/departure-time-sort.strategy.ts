import type { SearchResult } from '../search-api';
import { type SortStrategy, tieBreak } from './sort-strategy';

/** «Concrete Strategy»: earliest departure first. */
export class DepartureTimeSortStrategy implements SortStrategy {
  readonly key = 'DEPARTURE_TIME';

  compare(a: SearchResult, b: SearchResult): number {
    return tieBreak(a, b);
  }
}
