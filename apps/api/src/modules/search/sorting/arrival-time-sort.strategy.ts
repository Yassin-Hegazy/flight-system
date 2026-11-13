import type { SearchResult } from '../search-api';
import { type SortStrategy, tieBreak } from './sort-strategy';

/** «Concrete Strategy»: earliest arrival first. */
export class ArrivalTimeSortStrategy implements SortStrategy {
  readonly key = 'ARRIVAL_TIME';

  compare(a: SearchResult, b: SearchResult): number {
    return a.arrivalUtc.getTime() - b.arrivalUtc.getTime() || tieBreak(a, b);
  }
}
