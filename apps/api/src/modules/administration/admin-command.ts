import type { Tx } from '../../shared/db';
import type { DomainEvent } from '../../shared/events';
import type { Result } from '../../shared/result';
export interface AuditChange {
  target: string;
  flightId?: string;
  before: unknown;
  after: unknown;
}

/** What a command that succeeded hands back to the bus. */
export interface CommandOutcome<O> {
  value: O;
  audit: AuditChange[];
  /** Facts to announce. The bus publishes them only after the transaction has committed. */
  events?: DomainEvent[];
}

/**
 * Command (the lecture's ICommand): one administrative request as an object. A command is built
 * with its receivers (the modules that do the work) and its input, so `execute` needs nothing but
 * the transaction the bus opened for it. An expected failure is a Result error, never a throw.
 */
export interface AdminCommand<O, E> {
  /** The name of the operation, e.g. 'CreateFlight'. */
  readonly name: string;
  execute(tx: Tx): Promise<Result<CommandOutcome<O>, E>>;
}
