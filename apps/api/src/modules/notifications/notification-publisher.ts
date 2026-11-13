import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/time';
import { NOTIFICATION_DISPATCHER, type NotificationDispatcher } from './notification-channel';
import {
  NOTIFICATIONS_REPOSITORY,
  type NewNotification,
  type NotificationsRepository,
} from './notifications.repository';

/** A notification to store and push out: everything except the time, which the publisher sets. */
export type NotificationToPublish = Omit<NewNotification, 'createdAt'>;

/**
 * Stores one notification and, only if it is new, pushes it out through the delivery channels. The
 * event handler and the reminder service both end here, so "store once, then deliver" lives in one
 * place. The unique (eventId, userId) key decides what is new, so a repeated event or reminder is a
 * no-op. Callers decide what to do when this throws.
 */
@Injectable()
export class NotificationPublisher {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly repository: NotificationsRepository,
    @Inject(NOTIFICATION_DISPATCHER) private readonly channels: NotificationDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Returns true when the notification was new, false when it was a duplicate. */
  async publish(notification: NotificationToPublish): Promise<boolean> {
    const stored = await this.repository.insertIgnoringDuplicate({
      ...notification,
      createdAt: this.clock.now(),
    });
    if (!stored) return false;
    this.channels.dispatch(stored);
    return true;
  }
}
