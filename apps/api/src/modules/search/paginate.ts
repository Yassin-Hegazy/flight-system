import { ok, type Result } from '../../shared/result';

export const DEFAULT_PAGE_SIZE = 20;

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

/** The page asked for, with defaults applied. */
export function pageRequest(
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Result<PageRequest, 'INVALID_PAGE' | 'INVALID_PAGE_SIZE'> {
  return ok({ page, pageSize });
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
