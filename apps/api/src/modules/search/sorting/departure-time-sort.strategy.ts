import type { SearchResult } from '../search-api';
import type { SortStrategy } from './sort-strategy';

/** «Concrete Strategy»: earliest departure first. */
export class DepartureTimeSortStrategy implements SortStrategy {
  readonly key = 'DEPARTURE_TIME';

  compare(a: SearchResult, b: SearchResult): number {
    void a;
    void b;
    throw new Error('Not implemented: DepartureTimeSortStrategy');
  }
}
