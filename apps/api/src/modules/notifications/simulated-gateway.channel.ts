import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel, OutgoingNotification } from './notification-channel';

/**
 * The email/SMS gateway for this project is simulated: it accepts every message and logs that it
 * did, without contacting anything. A real gateway would be another NotificationChannel.
 */
@Injectable()
export class SimulatedGatewayChannel implements NotificationChannel {
  readonly name = 'simulated-email-sms-gateway';
  private readonly logger = new Logger(SimulatedGatewayChannel.name);

  send(notification: OutgoingNotification): Promise<void> {
    // The ID and type only: the message itself is not written to the logs (NFR-PRIV-01).
    this.logger.log(
      { notificationId: notification.id, type: notification.type },
      'Simulated gateway accepted a message',
    );
    return Promise.resolve();
  }
}
