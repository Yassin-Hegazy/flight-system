import { type EntityManager, QueryFailedError } from 'typeorm';

/**
 * A database transaction passed across module boundaries, so work that must be atomic across
 * modules commits or rolls back together (overview, section 2.2 rule 4).
 */
export type Tx = EntityManager;

/** True when PostgreSQL rejected a write because it broke a unique constraint. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: unknown } | undefined)?.code === '23505'
  );
}
