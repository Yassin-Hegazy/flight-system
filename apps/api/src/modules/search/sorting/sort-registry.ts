import type { SortKey } from '../search-api';
import type { SortStrategy } from './sort-strategy';

/**
 * Looks strategies up by key. The use case asks the registry instead of switching on the key, so
 * a new sort order is a new strategy class registered in search.module.ts, and nothing else.
 */
export class SortRegistry {
  constructor(strategies: readonly SortStrategy[]) {
    void strategies;
  }

  /** The strategy for this key, or undefined when no strategy has that key. */
  get(key: string): SortStrategy | undefined {
    void key;
    throw new Error('Not implemented: SortRegistry.get');
  }

  /** Every supported key, in registration order. */
  keys(): SortKey[] {
    throw new Error('Not implemented: SortRegistry.keys');
  }
}
