import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../../shared/time';
import { FlightCatalogModule } from '../flight-catalog/index';
import { InventoryModule } from '../inventory/index';
import { SEARCH_API } from './search-api';
import { SearchController } from './search.controller';
import { SearchFacade } from './search.facade';
import { SearchOneWay } from './search-one-way';
import { SearchRoundTrip } from './search-round-trip';
import { ArrivalTimeSortStrategy } from './sorting/arrival-time-sort.strategy';
import { DepartureTimeSortStrategy } from './sorting/departure-time-sort.strategy';
import { DurationSortStrategy } from './sorting/duration-sort.strategy';
import { PriceSortStrategy } from './sorting/price-sort.strategy';
import { SortRegistry } from './sorting/sort-registry';
import { SORT_STRATEGIES, type SortStrategy } from './sorting/sort-strategy';

/**
 * Search owns no tables. It asks the Catalog what flights exist and what they cost, and
 * Inventory which have room; both are reached only through their public interfaces.
 */
@Module({
  imports: [FlightCatalogModule, InventoryModule],
  controllers: [SearchController],
  providers: [
    // The sort orders. A new one (sort by stops, US-FS-08) is a new class and one line here.
    {
      provide: SORT_STRATEGIES,
      useValue: [
        new PriceSortStrategy(),
        new DurationSortStrategy(),
        new DepartureTimeSortStrategy(),
        new ArrivalTimeSortStrategy(),
      ] satisfies SortStrategy[],
    },
    {
      provide: SortRegistry,
      useFactory: (strategies: SortStrategy[]) => new SortRegistry(strategies),
      inject: [SORT_STRATEGIES],
    },
    { provide: CLOCK, useValue: systemClock },
    SearchOneWay,
    SearchRoundTrip,
    SearchFacade,
    { provide: SEARCH_API, useExisting: SearchFacade },
  ],
  exports: [SEARCH_API],
})
export class SearchModule {}
