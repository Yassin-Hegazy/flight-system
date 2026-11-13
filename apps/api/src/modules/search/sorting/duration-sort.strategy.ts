import type { SearchResult } from '../search-api';
import type { SortStrategy } from './sort-strategy';

/** «Concrete Strategy»: shortest flight first. */
export class DurationSortStrategy implements SortStrategy {
  readonly key = 'DURATION';

  compare(a: SearchResult, b: SearchResult): number {
    void a;
    void b;
    throw new Error('Not implemented: DurationSortStrategy');
  }
}
