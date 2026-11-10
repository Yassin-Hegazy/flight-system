import { randomUUID } from 'node:crypto';
import type {
  NewNotification,
  NotificationRecord,
  NotificationsRepository,
} from './notifications.repository';

/** In-memory stand-in for PgNotificationsRepository, so the rules are unit-tested without a database. */
export class InMemoryNotificationsRepository implements NotificationsRepository {
  readonly notifications: NotificationRecord[] = [];

  insertIgnoringDuplicate(notification: NewNotification): Promise<NotificationRecord | null> {
    const duplicate = this.notifications.some(
      (existing) =>
        existing.eventId === notification.eventId && existing.userId === notification.userId,
    );
    if (duplicate) return Promise.resolve(null);
    const stored: NotificationRecord = { ...notification, id: randomUUID(), readAt: null };
    this.notifications.push(stored);
    return Promise.resolve({ ...stored });
  }

  listForUser(userId: string, offset: number, limit: number): Promise<NotificationRecord[]> {
    const newestFirst = this.notifications
      .filter((notification) => notification.userId === userId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );
    return Promise.resolve(newestFirst.slice(offset, offset + limit).map((n) => ({ ...n })));
  }

  countForUser(userId: string): Promise<number> {
    return Promise.resolve(this.notifications.filter((n) => n.userId === userId).length);
  }

  countUnreadForUser(userId: string): Promise<number> {
    return Promise.resolve(
      this.notifications.filter((n) => n.userId === userId && n.readAt === null).length,
    );
  }

  findOwner(id: string): Promise<string | null> {
    return Promise.resolve(this.notifications.find((n) => n.id === id)?.userId ?? null);
  }

  markRead(id: string, userId: string, at: Date): Promise<boolean> {
    const notification = this.notifications.find((n) => n.id === id && n.userId === userId);
    if (!notification) return Promise.resolve(false);
    notification.readAt ??= at;
    return Promise.resolve(true);
  }

  markAllRead(userId: string, at: Date): Promise<number> {
    const unread = this.notifications.filter((n) => n.userId === userId && n.readAt === null);
    for (const notification of unread) notification.readAt = at;
    return Promise.resolve(unread.length);
  }
}
