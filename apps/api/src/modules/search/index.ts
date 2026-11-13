// Search's front door: the only file other code may import. Callers inject SEARCH_API and depend
// on the SearchApi interface; the use cases, strategies and facade class stay inside the module.
export { SearchModule } from './search.module';
export { SEARCH_API } from './search-api';
export type {
  Filters,
  LocalTime,
  OneWayCriteria,
  ResultPage,
  RoundTripCriteria,
  RoundTripPage,
  SearchApi,
  SearchError,
  SearchResult,
  SortKey,
} from './search-api';
