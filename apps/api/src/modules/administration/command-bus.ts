import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Result } from '../../shared/result';
import type { RequestContext } from '../users-access/index';
import type { AdminCommand } from './admin-command';

/**
 * Invoker: runs every administrative command the same way, and knows nothing about any specific
 * command. Authorization, the transaction and event publishing are written here once.
 */
@Injectable()
export class CommandBus {
  constructor(
    @InjectDataSource() private readonly dataSource: Pick<DataSource, 'transaction'>,
    private readonly events: EventEmitter2,
  ) {}

  dispatch<O, E>(command: AdminCommand<O, E>, ctx: RequestContext): Promise<Result<O, E>> {
    void ctx;
    return Promise.reject(new Error(`Not implemented: ${command.name}`));
  }
}
