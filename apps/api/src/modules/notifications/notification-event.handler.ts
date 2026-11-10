import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEvent } from '../../shared/events';
import { CLOCK, type Clock } from '../../shared/time';
import { NotificationChannelDispatcher } from './notification-channel.dispatcher';
import { NOTIFIED_EVENT_TYPES, type NotificationDraft, draftFor } from './notification-templates';
import { NOTIFICATIONS_REPOSITORY, type NotificationsRepository } from './notifications.repository';

/**
 * The Observer: subscribes to the domain events published by other modules and turns each into
 * in-app notifications. It only listens. It makes no booking or flight decisions and calls no
 * other module, because the event already says what happened and who to tell.
 */
@Injectable()
export class NotificationEventHandler implements OnModuleInit {
  private readonly logger = new Logger(NotificationEventHandler.name);

  constructor(
    private readonly events: EventEmitter2,
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly repository: NotificationsRepository,
    private readonly channels: NotificationChannelDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Subscribes to every event type that has a template, so adding a row to the template table is
   * all it takes to observe a new event. Subscribing one type at a time is deliberate: EventEmitter2
   * reads an array of names as ONE namespaced event (['a', 'b'] means 'a.b'), so a single
   * @OnEvent([...]) would silently listen to nothing.
   */
  onModuleInit(): void {
    for (const type of NOTIFIED_EVENT_TYPES) {
      // The listener returns its promise on purpose: emitAsync awaits it, so a publisher that
      // awaits publishDomainEvent resumes only after every observer has finished.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.events.on(type, (event: DomainEvent) => this.handle(event));
    }
  }

  /**
   * Imperative: map the event, then fan out to each recipient. This never throws: a failure is
   * logged with the event ID and the business action that raised the event is untouched
   * (US-NT-01 AC-4, NFR-OBS-01).
   */
  async handle(event: DomainEvent): Promise<void> {
    try {
      const draft = draftFor(event); // 1. map
      if (!draft) return; // 2. nothing to send
      for (const userId of new Set(draft.to)) {
        await this.notify(event, draft, userId); // 3. one notification per recipient
      }
    } catch (error) {
      this.logFailure(event, error);
    }
  }

  /** One recipient's failure is logged and does not stop the others from being told. */
  private async notify(
    event: DomainEvent,
    draft: NotificationDraft,
    userId: string,
  ): Promise<void> {
    try {
      const stored = await this.repository.insertIgnoringDuplicate({
        // 4. the unique (eventId, userId) key makes a repeated event a no-op
        userId,
        eventId: event.eventId,
        type: event.type,
        title: draft.title,
        body: draft.body,
        link: draft.link,
        createdAt: this.clock.now(),
      });
      if (stored) this.channels.dispatch(stored); // 5. only newly stored ones go outward
    } catch (error) {
      this.logFailure(event, error);
    }
  }

  private logFailure(event: DomainEvent, error: unknown): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    this.logger.error(
      {
        eventId: event.eventId,
        eventType: event.type,
        err: { name: failure.name, message: failure.message, stack: failure.stack },
      },
      'Notification handler failed',
    );
  }
}
