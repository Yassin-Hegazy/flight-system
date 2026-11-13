import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { err, ok, type Result } from '../../shared/result';
import { CLOCK, type Clock } from '../../shared/time';
import type { InboxPage, NotificationView, NotificationsApi } from './notifications-api';
import {
  NOTIFICATIONS_REPOSITORY,
  type NotificationRecord,
  type NotificationsRepository,
} from './notifications.repository';

export const PAGE_SIZE = 20;

function toView(record: NotificationRecord): NotificationView {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body,
    link: record.link,
    read: record.readAt !== null,
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * The inbox use cases. Every query is scoped to the user's own ID, so another user's notifications
 * are neither listed nor changed (US-USR-01). Reading changes only the notification, never the
 * booking or flight it reports on (US-NT-03 AC-1).
 */
@Injectable()
export class NotificationsService implements NotificationsApi {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly repository: NotificationsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async inbox(userId: string, page: number): Promise<InboxPage> {
    const pageNumber = Math.max(1, Math.trunc(page));
    const [records, total, unread] = await Promise.all([
      this.repository.listForUser(userId, (pageNumber - 1) * PAGE_SIZE, PAGE_SIZE),
      this.repository.countForUser(userId),
      this.repository.countUnreadForUser(userId),
    ]);
    return { items: records.map(toView), unread, total, page: pageNumber, pageSize: PAGE_SIZE };
  }

  async markRead(id: string, userId: string): Promise<Result<void, 'NOT_FOUND'>> {
    if (!isUUID(id)) return err('NOT_FOUND');
    const found = await this.repository.markRead(id, userId, this.clock.now());
    return found ? ok(undefined) : err('NOT_FOUND');
  }

  markAllRead(userId: string): Promise<number> {
    return this.repository.markAllRead(userId, this.clock.now());
  }

  ownerOf(id: string): Promise<string | null> {
    // A malformed ID is "no such notification", not a database error.
    return isUUID(id) ? this.repository.findOwner(id) : Promise.resolve(null);
  }
}
