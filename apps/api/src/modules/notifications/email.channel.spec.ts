import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryPreferencesRepository } from './in-memory-preferences.repository';
import type { EmailDirectory } from './email-directory';
import { EmailChannel } from './email.channel';
import { LocalMailCatcher } from './local-mail-catcher';
import type { MailTransport } from './mail';
import type { OutgoingNotification } from './notification-channel';
import { ALICE, BOB } from './test-support';

const ADDRESSES: Record<string, string> = {
  [ALICE]: 'alice@example.com',
  [BOB]: 'bob@example.com',
};
const directory: EmailDirectory = {
  emailOf: (userId) => Promise.resolve(ADDRESSES[userId] ?? null),
};

const notification = (overrides: Partial<OutgoingNotification> = {}): OutgoingNotification => ({
  id: 'n-1',
  userId: ALICE,
  type: 'BookingConfirmed',
  title: 'Booking K7M2QP confirmed',
  body: 'Your booking K7M2QP is confirmed.',
  link: '/bookings/K7M2QP',
  ...overrides,
});

let preferences: InMemoryPreferencesRepository;
let mail: LocalMailCatcher;
let channel: EmailChannel;

beforeEach(() => {
  preferences = new InMemoryPreferencesRepository();
  mail = new LocalMailCatcher();
  channel = new EmailChannel(preferences, directory, mail);
});

describe('US-NT-07 Receive notifications by email', () => {
  it('US-NT-07-T01 sends nothing until the traveler opts in: email is off by default', async () => {
    await channel.send(notification());

    expect(mail.outbox).toEqual([]);
  });

  it('US-NT-07-T01 once opted in for a type, that type arrives by email', async () => {
    await preferences.setEmail(ALICE, 'BookingConfirmed', true);

    await channel.send(notification());

    expect(mail.outbox).toEqual([
      {
        to: 'alice@example.com',
        subject: 'Booking K7M2QP confirmed',
        text: 'Your booking K7M2QP is confirmed.',
      },
    ]);
  });

  it('US-NT-07-T01 the opt-in is per type: other types still stay in the app', async () => {
    await preferences.setEmail(ALICE, 'BookingConfirmed', true);

    await channel.send(notification({ type: 'FlightDelayed', title: 'Flight MS123 delayed' }));

    expect(mail.outbox).toEqual([]);
  });

  it('US-NT-07-T01 opting out again stops the emails', async () => {
    await preferences.setEmail(ALICE, 'BookingConfirmed', true);
    await preferences.setEmail(ALICE, 'BookingConfirmed', false);

    await channel.send(notification());

    expect(mail.outbox).toEqual([]);
  });

  it('US-NT-07-T01 the choice belongs to one traveler: someone else’s opt-in does not email you', async () => {
    await preferences.setEmail(BOB, 'BookingConfirmed', true);

    await channel.send(notification({ userId: ALICE }));

    expect(mail.outbox).toEqual([]);
  });

  it('US-NT-07-T01 a traveler with no known address is skipped quietly', async () => {
    const nobody = '99999999-9999-4999-8999-999999999999';
    await preferences.setEmail(nobody, 'BookingConfirmed', true);

    await expect(channel.send(notification({ userId: nobody }))).resolves.toBeUndefined();

    expect(mail.outbox).toEqual([]);
  });

  it('NFR-PRIV-01-T03 the email carries exactly the in-app message, with nothing added', async () => {
    await preferences.setEmail(ALICE, 'BookingConfirmed', true);

    await channel.send(notification());

    expect(Object.keys(mail.outbox[0]).sort()).toEqual(['subject', 'text', 'to']);
  });

  it('US-NT-07-T02 a transport failure surfaces to the dispatcher, which isolates it', async () => {
    const broken: MailTransport = {
      send: () => Promise.reject(new Error('smtp down')),
    };
    await preferences.setEmail(ALICE, 'BookingConfirmed', true);

    await expect(
      new EmailChannel(preferences, directory, broken).send(notification()),
    ).rejects.toThrow('smtp down');
  });
});

describe('US-NT-07 the local mail catcher', () => {
  it('US-NT-07-T01 keeps what it was sent, so a developer can inspect it', async () => {
    await mail.send({ to: 'a@example.com', subject: 's', text: 't' });

    expect(mail.outbox).toHaveLength(1);
  });

  it('US-NT-07-T01 holds only the latest 100 messages, so it cannot grow without bound', async () => {
    for (let i = 0; i < 120; i += 1)
      await mail.send({ to: 'a@example.com', subject: `s${i}`, text: 't' });

    expect(mail.outbox).toHaveLength(100);
    expect(mail.outbox[0].subject).toBe('s20');
    expect(mail.outbox.at(-1)?.subject).toBe('s119');
  });
});
