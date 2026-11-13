import type { SearchResult } from '../search-api';
import { type SortStrategy, tieBreak } from './sort-strategy';

/** «Concrete Strategy»: cheapest party total first. */
export class PriceSortStrategy implements SortStrategy {
  readonly key = 'PRICE';

  compare(a: SearchResult, b: SearchResult): number {
    return a.total.amountMinor - b.total.amountMinor || tieBreak(a, b);
  }
}
