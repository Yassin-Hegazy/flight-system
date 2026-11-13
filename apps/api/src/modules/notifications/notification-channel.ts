/** A notification as a delivery channel receives it. */
export interface OutgoingNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
}

/**
 * Adapter: the one interface the module uses to push a notification out of the app, so an email
 * or SMS gateway can be swapped or added without touching the inbox or the event handler.
 */
export interface NotificationChannel {
  readonly name: string;
  send(notification: OutgoingNotification): Promise<void>;
}

/** All configured delivery channels (an array of NotificationChannel). */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

/**
 * What the module needs from the thing that pushes a stored notification through the channels, so
 * the publisher depends on this interface and not on the concrete dispatcher.
 */
export interface NotificationDispatcher {
  /** Starts delivery and returns immediately; never throws. */
  dispatch(notification: OutgoingNotification): void;
}

export const NOTIFICATION_DISPATCHER = Symbol('NOTIFICATION_DISPATCHER');
