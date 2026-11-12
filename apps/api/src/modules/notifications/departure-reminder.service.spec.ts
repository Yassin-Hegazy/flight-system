import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryNotificationsRepository } from './in-memory-notifications.repository';
import type { DepartureSource, UpcomingDeparture } from './departure-source';
import { NotificationChannelDispatcher } from './notification-channel.dispatcher';
import type { NotificationChannel, OutgoingNotification } from './notification-channel';
import { DepartureReminderService } from './departure-reminder.service';
import { ALICE, BOB, ManualClock } from './test-support';

const NOW = new Date('2026-12-09T08:00:00Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A departure `offsetMs` after NOW. Override anything else. */
function departure(
  offsetMs: number,
  overrides: Partial<UpcomingDeparture> = {},
): UpcomingDeparture {
  return {
    bookingId: `booking-${offsetMs}`,
    ownerId: ALICE,
    ref: 'K7M2QP',
    flightNumber: 'MS123',
    departureUtc: new Date(NOW.getTime() + offsetMs).toISOString(),
    departureTimeZone: 'Africa/Cairo',
    bookingStatus: 'TICKETED',
    flightStatus: 'SCHEDULED',
    ...overrides,
  };
}

/** A source that returns everything it was given, whatever range it is asked for. */
class FakeSource implements DepartureSource {
  readonly asked: { from: Date; to: Date }[] = [];
  constructor(public departures: UpcomingDeparture[]) {}

  ticketedDeparturesBetween(from: Date, to: Date): Promise<UpcomingDeparture[]> {
    this.asked.push({ from, to });
    return Promise.resolve(this.departures);
  }
}

class RecordingChannel implements NotificationChannel {
  readonly name = 'recording';
  readonly sent: OutgoingNotification[] = [];
  send(notification: OutgoingNotification): Promise<void> {
    this.sent.push(notification);
    return Promise.resolve();
  }
}

let repository: InMemoryNotificationsRepository;
let channel: RecordingChannel;
let source: FakeSource;
let service: DepartureReminderService;
let dispatcher: NotificationChannelDispatcher;

beforeEach(() => {
  repository = new InMemoryNotificationsRepository();
  channel = new RecordingChannel();
  dispatcher = new NotificationChannelDispatcher([channel]);
  source = new FakeSource([]);
  service = new DepartureReminderService(source, repository, dispatcher, new ManualClock(NOW));
});

const remindersFor = (userId: string) =>
  repository.notifications.filter((n) => n.userId === userId);

describe('US-NT-06 Get a departure reminder', () => {
  it.each([
    ['24 h 01 min away: too early', 24 * HOUR + MINUTE, 0],
    ['24 h 00 min away: the edge of the window', 24 * HOUR, 1],
    ['23 h 59 min away: inside the window', 23 * HOUR + 59 * MINUTE, 1],
    ['23 h 00 min away: the other edge of the window', 23 * HOUR, 1],
    ['22 h 59 min away: too late', 22 * HOUR + 59 * MINUTE, 0],
  ])('US-NT-06-T01 boundary: a flight %s', async (_name, offsetMs, expected) => {
    source.departures = [departure(offsetMs)];

    expect(await service.sendDueReminders(NOW)).toBe(expected);
    expect(remindersFor(ALICE)).toHaveLength(expected);
  });

  it('US-NT-06-T01 asks the source only for departures 23 to 24 hours ahead', async () => {
    await service.sendDueReminders(NOW);

    expect(source.asked).toEqual([
      { from: new Date(NOW.getTime() + 23 * HOUR), to: new Date(NOW.getTime() + 24 * HOUR) },
    ]);
  });

  it('US-NT-06-T01 the owner’s reminder names the flight and the local departure time', async () => {
    // 2026-12-10T07:00Z is 09:00 in Cairo (UTC+2).
    source.departures = [
      departure(23 * HOUR + 30 * MINUTE, { departureUtc: '2026-12-10T07:00:00.000Z' }),
    ];

    await service.sendDueReminders(NOW);

    expect(remindersFor(ALICE)[0]).toMatchObject({
      type: 'DepartureReminder',
      title: 'Flight MS123 departs tomorrow',
      link: '/bookings/K7M2QP',
    });
    expect(remindersFor(ALICE)[0].body).toContain('2026-12-10 09:00+02:00');
  });

  it('US-NT-06-T02 each booking is reminded once, however often the job runs', async () => {
    source.departures = [departure(23 * HOUR + 30 * MINUTE)];

    const counts = [
      await service.sendDueReminders(NOW),
      await service.sendDueReminders(NOW),
      await service.sendDueReminders(NOW),
    ];

    expect(counts).toEqual([1, 0, 0]);
    expect(remindersFor(ALICE)).toHaveLength(1);
  });

  it('US-NT-06-T02 two bookings of one traveler are each reminded', async () => {
    source.departures = [
      departure(23 * HOUR + 10 * MINUTE, { bookingId: 'b1', ref: 'AAAAAA' }),
      departure(23 * HOUR + 40 * MINUTE, { bookingId: 'b2', ref: 'BBBBBB' }),
    ];

    expect(await service.sendDueReminders(NOW)).toBe(2);
  });

  it('US-NT-06-T01 only the traveler whose booking departs is reminded', async () => {
    source.departures = [departure(23 * HOUR + 30 * MINUTE, { ownerId: BOB })];

    await service.sendDueReminders(NOW);

    expect(remindersFor(BOB)).toHaveLength(1);
    expect(remindersFor(ALICE)).toEqual([]);
  });

  it('US-NT-06-T03 a cancelled flight gets no reminder', async () => {
    source.departures = [departure(23 * HOUR + 30 * MINUTE, { flightStatus: 'CANCELLED' })];

    expect(await service.sendDueReminders(NOW)).toBe(0);
  });

  it.each(['CANCELLED', 'EXPIRED', 'PENDING_PAYMENT', 'CONFIRMED'])(
    'US-NT-06-T03 a booking that is %s, not ticketed, gets no reminder',
    async (bookingStatus) => {
      source.departures = [departure(23 * HOUR + 30 * MINUTE, { bookingStatus })];

      expect(await service.sendDueReminders(NOW)).toBe(0);
    },
  );

  it('US-NT-06-T01 a delayed flight is still reminded, at its new local time', async () => {
    source.departures = [departure(23 * HOUR + 30 * MINUTE, { flightStatus: 'DELAYED' })];

    expect(await service.sendDueReminders(NOW)).toBe(1);
  });

  it('US-NT-06-T01 a new reminder is also pushed through the delivery channels, once', async () => {
    source.departures = [departure(23 * HOUR + 30 * MINUTE)];

    await service.sendDueReminders(NOW);
    await service.sendDueReminders(NOW);
    await dispatcher.drain();

    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]).toMatchObject({ userId: ALICE, type: 'DepartureReminder' });
  });

  it('US-NT-06-T02 one bad departure is logged and does not stop the others', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const insert = repository.insertIgnoringDuplicate.bind(repository);
    vi.spyOn(repository, 'insertIgnoringDuplicate').mockImplementation((notification) =>
      notification.userId === ALICE ? Promise.reject(new Error('bad row')) : insert(notification),
    );
    source.departures = [
      departure(23 * HOUR + 10 * MINUTE, { bookingId: 'b1', ownerId: ALICE }),
      departure(23 * HOUR + 20 * MINUTE, { bookingId: 'b2', ownerId: BOB }),
    ];

    expect(await service.sendDueReminders(NOW)).toBe(1);
    expect(remindersFor(BOB)).toHaveLength(1);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});

describe('NFR-REL-02 the reminder job is safe to re-run', () => {
  it('NFR-REL-02-T01 two runs at the same moment still send one reminder per booking', async () => {
    source.departures = [departure(23 * HOUR + 30 * MINUTE)];

    const [first, second] = await Promise.all([
      service.sendDueReminders(NOW),
      service.sendDueReminders(NOW),
    ]);

    expect(first + second).toBe(1);
    expect(remindersFor(ALICE)).toHaveLength(1);
  });
});
