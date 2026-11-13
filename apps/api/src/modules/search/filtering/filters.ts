import type { Filters, LocalTime, SearchResult } from '../search-api';

/**
 * Filters as composable predicates: the declarative part of the module (pack section 6.1). Each
 * predicate states a condition and nothing about loops or order. The AND / OR rules of US-FS-03
 * AC-2 are visible as `every` (across filters) and `some` (inside the airline filter).
 */
export type Predicate = (result: SearchResult) => boolean;

/** The party total is at or under the limit (integer minor units). */
export const maxTotal =
  (limit: number): Predicate =>
  (result) =>
    result.total.amountMinor <= limit;

/** Departs inside the window on the origin airport's clock; both bounds are inclusive. */
export const departsBetween =
  (from: LocalTime, to: LocalTime): Predicate =>
  (result) => {
    const departs = localTimeOf(result.departureLocal);
    return from <= departs && departs <= to;
  };

/** Operated by any one of these airlines (OR inside one filter). */
export const operatedBy =
  (airlines: readonly string[]): Predicate =>
  (result) =>
    airlines.some((code) => code.toUpperCase() === result.airline.code);

/** The active filters AND'ed together. No filters keep every result. */
export function buildFilter(filters: Filters): Predicate {
  const { maxTotal: limit, departureWindow: window, airlines } = filters;
  const active = [
    limit !== undefined && maxTotal(limit),
    window && departsBetween(window.from, window.to),
    airlines?.length && operatedBy(airlines),
  ].filter((predicate): predicate is Predicate => typeof predicate === 'function');
  return (result) => active.every((predicate) => predicate(result));
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const AIRLINE_CODE = /^[A-Z0-9]{2}$/i;

/** Values the predicates can work with: whole non-negative price, HH:mm window in order, codes. */
export function isValidFilters({ maxTotal: limit, departureWindow, airlines }: Filters): boolean {
  if (limit !== undefined && !(Number.isSafeInteger(limit) && limit >= 0)) return false;
  if (departureWindow && !isValidWindow(departureWindow)) return false;
  return (airlines ?? []).every((code) => AIRLINE_CODE.test(code));
}

function isValidWindow({ from, to }: { from: LocalTime; to: LocalTime }): boolean {
  // HH:mm strings compare in clock order.
  return HH_MM.test(from) && HH_MM.test(to) && from <= to;
}

/** "2026-12-10T09:30+02:00" → "09:30": the Catalog's local strings already carry the zone. */
function localTimeOf(local: string): LocalTime {
  return local.slice(11, 16);
}
