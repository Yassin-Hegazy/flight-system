import type { SearchResult } from '../search-api';
import type { SortStrategy } from './sort-strategy';

/** «Concrete Strategy»: earliest arrival first. */
export class ArrivalTimeSortStrategy implements SortStrategy {
  readonly key = 'ARRIVAL_TIME';

  compare(a: SearchResult, b: SearchResult): number {
    void a;
    void b;
    throw new Error('Not implemented: ArrivalTimeSortStrategy');
  }
}
