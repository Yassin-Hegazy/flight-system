import type { SortKey } from '../search-api';
import type { SortStrategy } from './sort-strategy';

/**
 * Looks strategies up by key. The use case asks the registry instead of switching on the key, so
 * a new sort order is a new strategy class registered in search.module.ts, and nothing else.
 */
export class SortRegistry {
  private readonly byKey = new Map<SortKey, SortStrategy>();

  constructor(strategies: readonly SortStrategy[]) {
    for (const strategy of strategies) this.byKey.set(strategy.key, strategy);
  }

  /** The strategy for this key, or undefined when no strategy has that key. */
  get(key: string): SortStrategy | undefined {
    return this.byKey.get(key);
  }

  /** Every supported key, in registration order. */
  keys(): SortKey[] {
    return [...this.byKey.keys()];
  }
}
