import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/time';
import { DEPARTURE_SOURCE, type DepartureSource, type UpcomingDeparture } from './departure-source';
import { NotificationChannelDispatcher } from './notification-channel.dispatcher';
import { reminderDraft } from './notification-templates';
import { NOTIFICATIONS_REPOSITORY, type NotificationsRepository } from './notifications.repository';

const HOUR_MS = 60 * 60 * 1000;
/** "The day before": a flight 23 to 24 hours away. Run at least every 15 minutes, every booking passes through. */
const WINDOW_START_HOURS = 23;
const WINDOW_END_HOURS = 24;

const TICKETED = 'TICKETED';
const CANCELLED = 'CANCELLED';

/** The reminder rule (US-NT-06 AC-1 and AC-3): a ticketed booking on a flight that still flies. */
function isDue(departure: UpcomingDeparture, from: Date, to: Date): boolean {
  const at = Date.parse(departure.departureUtc);
  return (
    departure.bookingStatus === TICKETED &&
    departure.flightStatus !== CANCELLED &&
    at >= from.getTime() &&
    at <= to.getTime()
  );
}

/**
 * Sends the "your flight leaves tomorrow" reminders. Running it again, even at the same moment, is
 * harmless: each booking has one reminder ID, and the unique (eventId, userId) key stores it once
 * (US-NT-06 AC-2, NFR-REL-02).
 */
@Injectable()
export class DepartureReminderService {
  private readonly logger = new Logger(DepartureReminderService.name);

  constructor(
    @Inject(DEPARTURE_SOURCE) private readonly source: DepartureSource,
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly repository: NotificationsRepository,
    private readonly channels: NotificationChannelDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Reminds every booking departing 23 to 24 hours after `now`; returns how many were new. */
  async sendDueReminders(now: Date): Promise<number> {
    const from = new Date(now.getTime() + WINDOW_START_HOURS * HOUR_MS);
    const to = new Date(now.getTime() + WINDOW_END_HOURS * HOUR_MS);

    const candidates = await this.source.ticketedDeparturesBetween(from, to);
    let sent = 0;
    for (const departure of candidates) {
      // The window is checked again here, so the rule does not depend on the source's filtering.
      if (isDue(departure, from, to) && (await this.remind(departure))) sent += 1;
    }
    return sent;
  }

  /** One booking's failure is logged and does not stop the others being reminded. */
  private async remind(departure: UpcomingDeparture): Promise<boolean> {
    try {
      const draft = reminderDraft(departure);
      const stored = await this.repository.insertIgnoringDuplicate({
        userId: departure.ownerId,
        eventId: `reminder:${departure.bookingId}`,
        type: 'DepartureReminder',
        title: draft.title,
        body: draft.body,
        link: draft.link,
        createdAt: this.clock.now(),
      });
      if (stored) this.channels.dispatch(stored);
      return stored !== null;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        {
          eventId: `reminder:${departure.bookingId}`,
          err: { name: failure.name, message: failure.message },
        },
        'Departure reminder failed',
      );
      return false;
    }
  }
}
