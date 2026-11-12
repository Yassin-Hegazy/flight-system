import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepartureReminderService } from './departure-reminder.service';
import { InMemoryNotificationsRepository } from './in-memory-notifications.repository';
import { InMemoryPreferencesRepository } from './in-memory-preferences.repository';
import { NOTIFICATION_TYPES } from './notification-templates';
import { NotificationsService, PAGE_SIZE } from './notifications.service';
import { ALICE, BOB, ManualClock } from './test-support';

const START = new Date('2026-11-07T10:00:00Z');

let repository: InMemoryNotificationsRepository;
let clock: ManualClock;
let service: NotificationsService;
let preferences: InMemoryPreferencesRepository;
const sendDueReminders = vi.fn();

beforeEach(() => {
  repository = new InMemoryNotificationsRepository();
  clock = new ManualClock(START);
  preferences = new InMemoryPreferencesRepository();
  sendDueReminders.mockReset();
  service = new NotificationsService(
    repository,
    clock,
    { sendDueReminders } as unknown as DepartureReminderService,
    preferences,
  );
});

/** Stores a notification for a user, created `minutesAfterStart` after the start. */
async function seed(userId: string, title: string, minutesAfterStart = 0, eventId = title) {
  const stored = await repository.insertIgnoringDuplicate({
    userId,
    eventId,
    type: 'BookingConfirmed',
    title,
    body: `${title} body`,
    link: null,
    createdAt: new Date(START.getTime() + minutesAfterStart * 60_000),
  });
  if (!stored) throw new Error('seed: duplicate');
  return stored;
}

describe('US-NT-04 See my notification inbox', () => {
  it('US-NT-04-T01 shows only the user’s own notifications, newest first', async () => {
    await seed(ALICE, 'oldest', 0);
    await seed(BOB, 'bobs', 5);
    await seed(ALICE, 'newest', 10);
    await seed(ALICE, 'middle', 5);

    const inbox = await service.inbox(ALICE, 1);

    expect(inbox.items.map((item) => item.title)).toEqual(['newest', 'middle', 'oldest']);
    expect(inbox.total).toBe(3);
  });

  it('US-NT-04-T01 notifications created at the same instant keep one stable order', async () => {
    for (const title of ['a', 'b', 'c', 'd']) await seed(ALICE, title, 0);

    const first = (await service.inbox(ALICE, 1)).items.map((item) => item.id);
    const second = (await service.inbox(ALICE, 1)).items.map((item) => item.id);

    expect(second).toEqual(first);
  });

  it('US-NT-04-T01 pages hold 20 notifications each', async () => {
    for (let i = 0; i < 45; i += 1) await seed(ALICE, `n${i}`, i);

    const [one, two, three] = await Promise.all(
      [1, 2, 3].map((page) => service.inbox(ALICE, page)),
    );

    expect(PAGE_SIZE).toBe(20);
    expect([one.items.length, two.items.length, three.items.length]).toEqual([20, 20, 5]);
    expect(one.items[0].title).toBe('n44'); // newest first across pages
    expect(three.items.at(-1)?.title).toBe('n0');
    expect(three).toMatchObject({ page: 3, pageSize: 20, total: 45 });
  });

  it('US-NT-04-T01 a page past the end is empty, not an error', async () => {
    await seed(ALICE, 'only');

    expect((await service.inbox(ALICE, 9)).items).toEqual([]);
  });

  it('US-NT-04-T02 the unread count covers every page and drops as notifications are read', async () => {
    const stored = [];
    for (let i = 0; i < 25; i += 1) stored.push(await seed(ALICE, `n${i}`, i));
    await seed(BOB, 'bobs'); // someone else's unread notification is not counted

    expect((await service.inbox(ALICE, 1)).unread).toBe(25);

    await service.markRead(stored[0].id, ALICE);
    await service.markRead(stored[1].id, ALICE);

    expect((await service.inbox(ALICE, 2)).unread).toBe(23);
  });

  it('US-NT-04-T02 an empty inbox has no items and an unread count of zero', async () => {
    expect(await service.inbox(ALICE, 1)).toMatchObject({ items: [], unread: 0, total: 0 });
  });

  it('US-NT-04-T01 each item says whether it has been read', async () => {
    const stored = await seed(ALICE, 'one');
    await seed(ALICE, 'two', 1);
    await service.markRead(stored.id, ALICE);

    const items = (await service.inbox(ALICE, 1)).items;

    expect(items.map((item) => [item.title, item.read])).toEqual([
      ['two', false],
      ['one', true],
    ]);
  });
});

describe('US-NT-03 Mark a notification as read', () => {
  it('US-NT-03-T01 changes only that notification’s read state and read time', async () => {
    const target = await seed(ALICE, 'target', 0);
    const other = await seed(ALICE, 'other', 1);
    clock.advanceMinutes(30);

    expect(await service.markRead(target.id, ALICE)).toEqual({ ok: true, value: undefined });

    const [stored, untouched] = [target, other].map((n) =>
      repository.notifications.find((candidate) => candidate.id === n.id)!,
    );
    expect(stored.readAt).toEqual(new Date('2026-11-07T10:30:00Z'));
    expect(untouched.readAt).toBeNull();
  });

  it('US-NT-03-T02 another user’s notification is not found, and stays unread', async () => {
    const bobs = await seed(BOB, 'bobs');

    expect(await service.markRead(bobs.id, ALICE)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(repository.notifications[0].readAt).toBeNull();
  });

  it('US-NT-03-T02 an unknown or malformed ID gets the same not-found answer', async () => {
    const unknown = await service.markRead('99999999-9999-4999-8999-999999999999', ALICE);
    const malformed = await service.markRead('not-a-uuid', ALICE);

    expect(unknown).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(malformed).toEqual(unknown);
  });

  it('US-NT-03-T03 marking an already-read notification changes nothing: the first read time stays', async () => {
    const stored = await seed(ALICE, 'one');
    clock.advanceMinutes(10);
    await service.markRead(stored.id, ALICE);
    clock.advanceMinutes(10);

    const again = await service.markRead(stored.id, ALICE);

    expect(again.ok).toBe(true);
    expect(repository.notifications[0].readAt).toEqual(new Date('2026-11-07T10:10:00Z'));
  });

  it('US-NT-03-T02 ownerOf names the owner, and nobody for an unknown or malformed ID', async () => {
    const stored = await seed(BOB, 'bobs');

    expect(await service.ownerOf(stored.id)).toBe(BOB);
    expect(await service.ownerOf('99999999-9999-4999-8999-999999999999')).toBeNull();
    expect(await service.ownerOf('not-a-uuid')).toBeNull();
  });
});

describe('US-NT-05 Mark all as read', () => {
  it('US-NT-05-T01 marks every unread notification of the user and touches no one else’s', async () => {
    await seed(ALICE, 'a1');
    await seed(ALICE, 'a2');
    await seed(BOB, 'b1');

    expect(await service.markAllRead(ALICE)).toBe(2);

    expect((await service.inbox(ALICE, 1)).unread).toBe(0);
    expect((await service.inbox(BOB, 1)).unread).toBe(1);
  });

  it('US-NT-05-T01 already-read notifications keep their read time and are not counted', async () => {
    const first = await seed(ALICE, 'a1');
    await service.markRead(first.id, ALICE);
    clock.advanceMinutes(5);
    await seed(ALICE, 'a2');

    expect(await service.markAllRead(ALICE)).toBe(1);
    expect(repository.notifications[0].readAt).toEqual(START);
  });
});

describe('US-NT-07 email preferences', () => {
  it('US-NT-07-T03 every notification type is listed, with email off until the traveler opts in', async () => {
    const list = await service.preferences(ALICE);

    expect(list.map((p) => p.type)).toEqual([...NOTIFICATION_TYPES]);
    expect(list.every((p) => p.email === false)).toBe(true);
  });

  it('US-NT-07-T03 opting in changes only that type, for only that traveler', async () => {
    expect(await service.setEmailPreference(ALICE, 'FlightDelayed', true)).toEqual({
      ok: true,
      value: undefined,
    });

    const alices = await service.preferences(ALICE);
    expect(alices.filter((p) => p.email).map((p) => p.type)).toEqual(['FlightDelayed']);
    expect((await service.preferences(BOB)).some((p) => p.email)).toBe(false);
  });

  it('US-NT-07-T03 opting out again turns it back off', async () => {
    await service.setEmailPreference(ALICE, 'FlightDelayed', true);
    await service.setEmailPreference(ALICE, 'FlightDelayed', false);

    expect((await service.preferences(ALICE)).some((p) => p.email)).toBe(false);
  });

  it('US-NT-07-T03 a type that does not exist is refused, and nothing is stored', async () => {
    expect(await service.setEmailPreference(ALICE, 'Nonsense', true)).toEqual({
      ok: false,
      error: 'UNKNOWN_TYPE',
    });
    expect(await preferences.list(ALICE)).toEqual([]);
  });
});

describe('US-NT-06 departure reminders through the API', () => {
  it('US-NT-06-T01 sendDepartureReminders hands the moment to the reminder service and returns its count', async () => {
    sendDueReminders.mockResolvedValue(4);
    const now = new Date('2026-12-09T08:00:00Z');

    expect(await service.sendDepartureReminders(now)).toBe(4);
    expect(sendDueReminders).toHaveBeenCalledWith(now);
  });
});
