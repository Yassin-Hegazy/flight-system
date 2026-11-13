import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { publishDomainEvent } from '../../shared/events';
import { err, ok, type Result } from '../../shared/result';
import {
  Action,
  type RequestContext,
  signedIn,
  UserRole,
  WithAuth,
  WithRole,
} from '../users-access/index';
import { AuditLog } from './audit-log';
import type { AdminCommand, CommandOutcome } from './admin-command';

/** Carries a command's expected failure out of the transaction callback, so TypeORM rolls back. */
class RolledBack<E> extends Error {
  constructor(readonly error: E) {
    super('Command failed; transaction rolled back');
  }
}

/**
 * Invoker: runs every administrative command the same way, and knows nothing about any specific
 * command. Authorization, the transaction and event publishing are written here once, so a new
 * command gets all three and cannot forget one (NFR-SEC-02, NFR-CONS-02).
 */
@Injectable()
export class CommandBus {
  private readonly logger = new Logger(CommandBus.name);

  constructor(
    @InjectDataSource() private readonly dataSource: Pick<DataSource, 'transaction'>,
    private readonly events: EventEmitter2,
    private readonly auditLog: AuditLog,
  ) {}

  /**
   * 1. signed in (401) and 2. an administrator (403), through the Users and Access decorators;
   * 3. the command, inside one transaction that rolls back on any failure;
   * 4. its events, only once that transaction has committed.
   */
  dispatch<O, E>(command: AdminCommand<O, E>, ctx: RequestContext): Promise<Result<O, E>> {
    const run = new Action<undefined, Result<O, E>>((caller) =>
      this.run(command, signedIn(caller).id),
    );
    return new WithAuth(new WithRole(run, UserRole.Admin)).execute(ctx, undefined);
  }

  private async run<O, E>(command: AdminCommand<O, E>, actorId: string): Promise<Result<O, E>> {
    let outcome: CommandOutcome<O>;
    try {
      outcome = await this.dataSource.transaction('READ COMMITTED', async (tx) => {
        const result = await command.execute(tx);
        if (!result.ok) throw new RolledBack(result.error);
        await this.auditLog.append(tx, actorId, command.name, result.value.audit);
        return result.value;
      });
    } catch (error) {
      if (error instanceof RolledBack) return err(error.error as E);
      throw error;
    }
    for (const event of outcome.events ?? []) {
      try {
        await publishDomainEvent(this.events, event);
      } catch (error) {
        this.logger.error(
          { command: command.name, eventId: event.eventId, eventType: event.type, err: error },
          'Failed to publish a committed administration event',
        );
      }
    }
    return ok(outcome.value);
  }
}
