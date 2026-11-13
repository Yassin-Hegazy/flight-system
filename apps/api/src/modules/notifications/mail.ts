export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Adapter: how an email leaves the app. LocalMailCatcher is used in development and tests; a real
 * SMTP or API transport would be another implementation, with no change to the email channel.
 */
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
