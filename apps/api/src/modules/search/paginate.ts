import { err, ok, type Result } from '../../shared/result';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

const isPositiveWhole = (value: number) => Number.isSafeInteger(value) && value >= 1;

/**
 * The page asked for (US-FS-05 AC-1): page 1 of 20 by default. A size above 50 is capped, since a
 * user never typed it; a size or page below 1 is a client bug, so it is reported.
 */
export function pageRequest(
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Result<PageRequest, 'INVALID_PAGE' | 'INVALID_PAGE_SIZE'> {
  if (!isPositiveWhole(page)) return err('INVALID_PAGE');
  if (!isPositiveWhole(pageSize)) return err('INVALID_PAGE_SIZE');
  return ok({ page, pageSize: Math.min(pageSize, MAX_PAGE_SIZE) });
}

/** Step 8: one page of an already filtered and sorted list, with the metadata the UI needs. */
export function paginate<T>(items: readonly T[], { page, pageSize }: PageRequest): Page<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
    hasNext: start + pageSize < items.length,
  };
}
