// Notifications: the only file other modules may import.
// Other modules do not call Notifications; they publish domain events (see shared/events.ts).
export { NotificationsModule } from './notifications.module';
export { NOTIFICATIONS_API } from './notifications-api';
export type { InboxPage, NotificationView, NotificationsApi } from './notifications-api';
