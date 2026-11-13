import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CLOCK, type Clock } from '../../shared/time';
import { DEPARTURE_REMINDERS_API, type DepartureRemindersApi } from './notifications-api';

/**
 * The scheduled trigger for departure reminders. Every 10 minutes is more often than the 15 the
 * story needs, so every ticketed booking passes through its 23-to-24-hour window while the job
 * runs. ScheduleModule is registered in app.module.ts and finds this class by its decorator.
 */
@Injectable()
export class DepartureReminderJob {
  private readonly logger = new Logger(DepartureReminderJob.name);

  constructor(
    @Inject(DEPARTURE_REMINDERS_API) private readonly reminders: DepartureRemindersApi,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'departure-reminders' })
  async run(): Promise<void> {
    try {
      const sent = await this.reminders.sendDueReminders(this.clock.now());
      if (sent > 0) this.logger.log({ sent }, 'Departure reminders sent');
    } catch (error) {
      // A failed run is simply retried by the next one; it must never crash the process.
      const failure = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        { err: { name: failure.name, message: failure.message } },
        'Departure reminder run failed',
      );
    }
  }
}
