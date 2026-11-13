export interface NotificationRecord {
  id: string;
  userId: string;
  eventId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export type NewNotification = Omit<NotificationRecord, 'id' | 'readAt'>;

/**
 * Everything Notifications needs from storage (Repository pattern). PgNotificationsRepository is
 * the only file with SQL for this module's table; InMemoryNotificationsRepository replaces it in
 * unit tests.
 */
export interface NotificationsRepository {
  /**
   * Stores the notification unless one already exists for the same event and user. Returns the
   * stored record, or null when it was a duplicate. The unique key decides, not a prior lookup,
   * so two deliveries racing each other still store it once.
   */
  insertIgnoringDuplicate(notification: NewNotification): Promise<NotificationRecord | null>;

  /** One user's notifications, newest first, with a stable order for equal times. */
  listForUser(userId: string, offset: number, limit: number): Promise<NotificationRecord[]>;
  countForUser(userId: string): Promise<number>;
  countUnreadForUser(userId: string): Promise<number>;

  /** The owner of a notification, or null when there is no such notification. */
  findOwner(id: string): Promise<string | null>;
  /**
   * Marks the user's own notification as read at the given time, unless it is already read (the
   * first read time is kept). Returns false when the user has no such notification.
   */
  markRead(id: string, userId: string, at: Date): Promise<boolean>;
  /** Marks all of the user's unread notifications as read; returns how many changed. */
  markAllRead(userId: string, at: Date): Promise<number>;
}

export const NOTIFICATIONS_REPOSITORY = Symbol('NOTIFICATIONS_REPOSITORY');
