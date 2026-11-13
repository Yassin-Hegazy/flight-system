import type { Result } from '../../shared/result';

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  /** An app-relative path the notification points to, or null. */
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  type: string;
  /** Whether this type is also sent by email. In-app is always on. Off until the user opts in. */
  email: boolean;
}

export interface InboxPage {
  /** This page's notifications, newest first. */
  items: NotificationView[];
  /** All of the user's unread notifications, not only those on this page. */
  unread: number;
  total: number;
  page: number;
  pageSize: number;
}

/** The Notifications boundary. Notifications only listens to events; this is the inbox side. */
export interface NotificationsApi {
  inbox(userId: string, page: number): Promise<InboxPage>;
  /** NOT_FOUND for another user's notification, exactly as for one that does not exist. */
  markRead(id: string, userId: string): Promise<Result<void, 'NOT_FOUND'>>;
  /** Marks all of the user's unread notifications as read; returns how many changed. */
  markAllRead(userId: string): Promise<number>;
  /** The owner of a notification, or null when there is none (including a malformed ID). */
  ownerOf(id: string): Promise<string | null>;
}

export const NOTIFICATIONS_API = Symbol('NOTIFICATIONS_API');

/** The preferences side of the boundary: which notification types are also sent by email. */
export interface PreferencesApi {
  /** Every notification type with the user's email choice, off unless they opted in. */
  preferences(userId: string): Promise<NotificationPreference[]>;
  /** Opts in to, or out of, email for one notification type. */
  setEmailPreference(
    userId: string,
    type: string,
    enabled: boolean,
  ): Promise<Result<void, 'UNKNOWN_TYPE'>>;
}

export const PREFERENCES_API = Symbol('PREFERENCES_API');

/** The reminders side of the boundary: what the scheduled job (and the tests) call. */
export interface DepartureRemindersApi {
  /** Sends the day-before reminders for departures 23 to 24 hours after `now`; returns how many were new. */
  sendDueReminders(now: Date): Promise<number>;
}

export const DEPARTURE_REMINDERS_API = Symbol('DEPARTURE_REMINDERS_API');
