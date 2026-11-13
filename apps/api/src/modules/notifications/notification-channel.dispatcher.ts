import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationDispatcher,
  type OutgoingNotification,
} from './notification-channel';

/**
 * Pushes a stored notification out through every channel without ever holding up, or failing,
 * the caller: a slow or broken gateway must not delay or undo a booking or a status change
 * (NFR 5). Failures are logged and dropped; the in-app notification is already stored.
 */
@Injectable()
export class NotificationChannelDispatcher implements NotificationDispatcher {
  private readonly logger = new Logger(NotificationChannelDispatcher.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: readonly NotificationChannel[],
  ) {}

  /** Starts delivery on every channel and returns immediately. */
  dispatch(notification: OutgoingNotification): void {
    for (const channel of this.channels) {
      const delivery: Promise<void> = this.deliver(channel, notification).then(() => {
        this.inFlight.delete(delivery);
      });
      this.inFlight.add(delivery);
    }
  }

  /** Resolves once every delivery started so far has finished. For tests and shutdown. */
  async drain(): Promise<void> {
    await Promise.all([...this.inFlight]);
  }

  /** Never rejects. */
  private async deliver(
    channel: NotificationChannel,
    notification: OutgoingNotification,
  ): Promise<void> {
    try {
      await channel.send(notification);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        {
          channel: channel.name,
          notificationId: notification.id,
          err: { name: failure.name, message: failure.message },
        },
        'Channel delivery failed',
      );
    }
  }
}
