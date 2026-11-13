import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailTransport } from './mail';

const KEEP_LATEST = 100;

/**
 * The development mail catcher: it accepts every message and keeps the latest ones in memory, so
 * nothing is ever really sent. Only the fact that a message arrived is logged, never its text or
 * address (NFR-PRIV-01).
 */
@Injectable()
export class LocalMailCatcher implements MailTransport {
  private readonly logger = new Logger(LocalMailCatcher.name);
  private readonly messages: MailMessage[] = [];

  /** The latest messages, oldest first. */
  get outbox(): readonly MailMessage[] {
    return this.messages;
  }

  send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    if (this.messages.length > KEEP_LATEST) this.messages.shift();
    this.logger.log({ subject: message.subject }, 'Local mail catcher accepted a message');
    return Promise.resolve();
  }
}
