import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DepartureReminderJob } from './departure-reminder.job';
import type { DepartureRemindersApi } from './notifications-api';
import { ManualClock } from './test-support';

const NOW = new Date('2026-12-09T08:00:00Z');

describe('NFR-REL-02 the reminder job is safe to re-run', () => {
  it('NFR-REL-02-T02 each run reminds for the current moment', async () => {
    const sendDueReminders = vi.fn().mockResolvedValue(3);
    const reminders: DepartureRemindersApi = { sendDueReminders };
    const job = new DepartureReminderJob(reminders, new ManualClock(NOW));

    await job.run();

    expect(sendDueReminders).toHaveBeenCalledWith(NOW);
  });

  it('NFR-REL-02-T02 a failing run is logged and never crashes the scheduler', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sendDueReminders = vi.fn().mockRejectedValue(new Error('booking source down'));
    const reminders: DepartureRemindersApi = { sendDueReminders };
    const job = new DepartureReminderJob(reminders, new ManualClock(NOW));

    await expect(job.run()).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: 'booking source down' }) }),
      'Departure reminder run failed',
    );
    logged.mockRestore();
  });
});
