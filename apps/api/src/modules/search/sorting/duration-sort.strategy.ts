import type { SearchResult } from '../search-api';
import { type SortStrategy, tieBreak } from './sort-strategy';

/** «Concrete Strategy»: shortest flight first. */
export class DurationSortStrategy implements SortStrategy {
  readonly key = 'DURATION';

  compare(a: SearchResult, b: SearchResult): number {
    return a.durationMinutes - b.durationMinutes || tieBreak(a, b);
  }
}
