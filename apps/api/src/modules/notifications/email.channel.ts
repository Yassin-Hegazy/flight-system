import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_DIRECTORY, type EmailDirectory } from './email-directory';
import { MAIL_TRANSPORT, type MailTransport } from './mail';
import type { NotificationChannel, OutgoingNotification } from './notification-channel';
import { PREFERENCES_REPOSITORY, type PreferencesRepository } from './preferences.repository';

/**
 * Sends a notification by email, but only to travelers who opted in to that type (US-NT-07 AC-1).
 * It is one more NotificationChannel, so the inbox and the event handler know nothing about email,
 * and a failure here is isolated by the dispatcher: the in-app notification is already stored
 * (US-NT-07 AC-2). The email carries exactly the in-app title and text, nothing more (NFR-PRIV-01).
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';

  constructor(
    @Inject(PREFERENCES_REPOSITORY) private readonly preferences: PreferencesRepository,
    @Inject(EMAIL_DIRECTORY) private readonly directory: EmailDirectory,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  async send(notification: OutgoingNotification): Promise<void> {
    if (!(await this.preferences.isEmailEnabled(notification.userId, notification.type))) return;

    const to = await this.directory.emailOf(notification.userId);
    if (!to) return;

    await this.transport.send({ to, subject: notification.title, text: notification.body });
  }
}
