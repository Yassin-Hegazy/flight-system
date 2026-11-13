import { Injectable } from '@nestjs/common';
import type { OneWayCriteria, RoundTripCriteria, SearchApi, SortKey } from './search-api';
import { SearchOneWay } from './search-one-way';
import { SearchRoundTrip } from './search-round-trip';
import { SortRegistry } from './sorting/sort-registry';

/**
 * Facade: the one entry point to Search, as InventoryFacade is to Inventory. Callers see the
 * SearchApi interface; the use cases, the strategies and the registry stay inside the module.
 */
@Injectable()
export class SearchFacade implements SearchApi {
  constructor(
    private readonly oneWay: SearchOneWay,
    private readonly roundTrip: SearchRoundTrip,
    private readonly sorts: SortRegistry,
  ) {}

  searchOneWay(criteria: OneWayCriteria) {
    return this.oneWay.execute(criteria);
  }

  searchRoundTrip(criteria: RoundTripCriteria) {
    return this.roundTrip.execute(criteria);
  }

  sortKeys(): SortKey[] {
    return this.sorts.keys();
  }
}
