import type { Filters, LocalTime, SearchResult } from '../search-api';

/** A condition one result either meets or not (pack section 6.1). */
export type Predicate = (result: SearchResult) => boolean;

export const maxTotal =
  (limit: number): Predicate =>
  (result) => {
    void [limit, result];
    throw new Error('Not implemented: maxTotal');
  };

export const departsBetween =
  (from: LocalTime, to: LocalTime): Predicate =>
  (result) => {
    void [from, to, result];
    throw new Error('Not implemented: departsBetween');
  };

export const operatedBy =
  (airlines: readonly string[]): Predicate =>
  (result) => {
    void [airlines, result];
    throw new Error('Not implemented: operatedBy');
  };

export function buildFilter(filters: Filters): Predicate {
  void filters;
  throw new Error('Not implemented: buildFilter');
}

export function isValidFilters(filters: Filters): boolean {
  void filters;
  throw new Error('Not implemented: isValidFilters');
}
