import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, IsNull } from 'typeorm';
import { NotificationEntity } from './notification.entity';
import type {
  NewNotification,
  NotificationRecord,
  NotificationsRepository,
} from './notifications.repository';

/** PostgreSQL implementation of NotificationsRepository: the only file with SQL for this module. */
@Injectable()
export class PgNotificationsRepository implements NotificationsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get db(): EntityManager {
    return this.dataSource.manager;
  }

  async insertIgnoringDuplicate(notification: NewNotification): Promise<NotificationRecord | null> {
    // ON CONFLICT DO NOTHING returns no row for a duplicate.
    const result = await this.db
      .createQueryBuilder()
      .insert()
      .into(NotificationEntity)
      .values(notification)
      .orIgnore()
      .returning('*')
      .execute();
    const [stored] = result.raw as NotificationRecord[];
    return stored ?? null;
  }

  listForUser(userId: string, offset: number, limit: number): Promise<NotificationRecord[]> {
    return this.db.find(NotificationEntity, {
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: offset,
      take: limit,
    });
  }

  countForUser(userId: string): Promise<number> {
    return this.db.countBy(NotificationEntity, { userId });
  }

  countUnreadForUser(userId: string): Promise<number> {
    return this.db.countBy(NotificationEntity, { userId, readAt: IsNull() });
  }

  async findOwner(id: string): Promise<string | null> {
    const found = await this.db.findOne(NotificationEntity, {
      select: { userId: true },
      where: { id },
    });
    return found?.userId ?? null;
  }

  async markRead(id: string, userId: string, at: Date): Promise<boolean> {
    // Both conditions in one statement: only the owner's row, and only while it is still unread.
    await this.db.update(NotificationEntity, { id, userId, readAt: IsNull() }, { readAt: at });
    return this.db.existsBy(NotificationEntity, { id, userId });
  }

  async markAllRead(userId: string, at: Date): Promise<number> {
    const result = await this.db.update(
      NotificationEntity,
      { userId, readAt: IsNull() },
      { readAt: at },
    );
    return result.affected ?? 0;
  }
}
