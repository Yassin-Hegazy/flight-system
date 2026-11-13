import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Tx } from '../../shared/db';
import type { AuditChange } from './admin-command';
import { AuditEntry } from './audit-log.entity';

@Injectable()
export class AuditLog {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async append(tx: Tx, actorId: string, action: string, changes: AuditChange[]): Promise<void> {
    if (!changes.length) return;
    await tx.save(
      AuditEntry,
      changes.map(({ target, flightId, before, after }) => ({
        actorId,
        action,
        target,
        flightId: flightId ?? null,
        before,
        after,
      })),
    );
  }

  list(flightId: string | undefined, page: number) {
    return this.db.manager.find(AuditEntry, {
      where: flightId ? { flightId } : {},
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * 20,
      take: 20,
    });
  }
}
