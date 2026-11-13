import type { SearchResult } from '../search-api';
import type { SortStrategy } from './sort-strategy';

/** «Concrete Strategy»: cheapest party total first. */
export class PriceSortStrategy implements SortStrategy {
  readonly key = 'PRICE';

  compare(a: SearchResult, b: SearchResult): number {
    void a;
    void b;
    throw new Error('Not implemented: PriceSortStrategy');
  }
}
