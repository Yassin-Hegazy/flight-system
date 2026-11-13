// Notifications: the only file other modules may import.
// Other modules do not call Notifications; they publish domain events (see shared/events.ts).
// The ports below are the few things Notifications needs back from other modules.
export { NotificationsModule } from './notifications.module';
export { DEPARTURE_REMINDERS_API, NOTIFICATIONS_API, PREFERENCES_API } from './notifications-api';
export type {
  DepartureRemindersApi,
  InboxPage,
  NotificationPreference,
  NotificationView,
  NotificationsApi,
  PreferencesApi,
} from './notifications-api';
// Booking implements this, so reminders can find upcoming departures.
export { DEPARTURE_SOURCE } from './departure-source';
export type { DepartureSource, UpcomingDeparture } from './departure-source';
// Users and Access implements this, so email can find an address.
export { EMAIL_DIRECTORY } from './email-directory';
export type { EmailDirectory } from './email-directory';
// The transport an email leaves through (a local catcher in development).
export { MAIL_TRANSPORT } from './mail';
export type { MailMessage, MailTransport } from './mail';
