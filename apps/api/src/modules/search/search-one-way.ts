import { Inject, Injectable } from '@nestjs/common';
import type { Result } from '../../shared/result';
import { CLOCK, type Clock } from '../../shared/time';
import { CATALOG_API, type CatalogApi } from '../flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import type { OneWayCriteria, ResultPage, SearchError } from './search-api';
import { SortRegistry } from './sorting/sort-registry';

/** The one-way search use case (pack section 3.1). */
@Injectable()
export class SearchOneWay {
  constructor(
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    private readonly sorts: SortRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(criteria: OneWayCriteria): Promise<Result<ResultPage, SearchError>> {
    void [this.catalog, this.inventory, this.sorts, this.clock];
    return Promise.reject(new Error(`Not implemented: SearchOneWay(${criteria.date})`));
  }
}
