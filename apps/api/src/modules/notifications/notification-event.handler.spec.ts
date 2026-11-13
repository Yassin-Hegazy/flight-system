import { Logger } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DomainEvent, publishDomainEvent } from '../../shared/events';
import { CLOCK } from '../../shared/time';
import { EmailChannel } from './email.channel';
import { InMemoryNotificationsRepository } from './in-memory-notifications.repository';
import { InMemoryPreferencesRepository } from './in-memory-preferences.repository';
import { LocalMailCatcher } from './local-mail-catcher';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DISPATCHER,
  type NotificationChannel,
  type OutgoingNotification,
} from './notification-channel';
import { NotificationChannelDispatcher } from './notification-channel.dispatcher';
import { NotificationEventHandler } from './notification-event.handler';
import { NotificationPublisher } from './notification-publisher';
import { NOTIFICATIONS_REPOSITORY } from './notifications.repository';
import {
  ALICE,
  BOB,
  CARA,
  ManualClock,
  bookingCancelled,
  bookingEvent,
  flightCancelled,
  flightDelayed,
} from './test-support';

/** A gateway that records what it was asked to send. */
class RecordingChannel implements NotificationChannel {
  readonly name = 'recording';
  readonly sent: OutgoingNotification[] = [];

  send(notification: OutgoingNotification): Promise<void> {
    this.sent.push(notification);
    return Promise.resolve();
  }
}

/**
 * Boots a real Nest context with the same global event emitter the app uses, so events reach the
 * handler through its @OnEvent subscription, not through a direct call.
 */
async function startHarness(channels: NotificationChannel[] = []) {
  const repository = new InMemoryNotificationsRepository();
  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot()],
    providers: [
      NotificationEventHandler,
      NotificationPublisher,
      NotificationChannelDispatcher,
      { provide: NOTIFICATION_DISPATCHER, useExisting: NotificationChannelDispatcher },
      { provide: NOTIFICATIONS_REPOSITORY, useValue: repository },
      { provide: NOTIFICATION_CHANNELS, useValue: channels },
      { provide: CLOCK, useValue: new ManualClock(new Date('2026-11-07T10:00:00Z')) },
    ],
  }).compile();
  await moduleRef.init();

  const emitter = moduleRef.get(EventEmitter2);
  return {
    repository,
    dispatcher: moduleRef.get(NotificationChannelDispatcher),
    publish: (event: DomainEvent) => publishDomainEvent(emitter, event),
    inboxOf: (userId: string) =>
      repository.notifications.filter((notification) => notification.userId === userId),
    close: () => moduleRef.close(),
  };
}

type Harness = Awaited<ReturnType<typeof startHarness>>;

let harness: Harness;
let logged: MockInstance<Logger['error']>;

beforeEach(() => {
  logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  logged.mockRestore();
  await harness.close();
});

describe('US-NT-01 Get booking notifications', () => {
  it.each([
    ['BookingConfirmed', bookingEvent('BookingConfirmed', { ref: 'K7M2QP' })],
    ['TicketsIssued', bookingEvent('TicketsIssued', { ref: 'K7M2QP' })],
    ['BookingExpired', bookingEvent('BookingExpired', { ref: 'K7M2QP' })],
    ['BookingCancelled', bookingCancelled({ reason: 'TRAVELER', ref: 'K7M2QP' })],
  ] as [string, DomainEvent][])(
    'US-NT-01-T01 %s creates one in-app notification for the owner',
    async (type, event) => {
      harness = await startHarness();

      await harness.publish(event);

      expect(harness.inboxOf(ALICE)).toEqual([
        expect.objectContaining({ type, link: '/bookings/K7M2QP', readAt: null }),
      ]);
      expect(harness.inboxOf(BOB)).toEqual([]);
    },
  );

  it('US-NT-01-T01 BookingConfirmed notifies exactly its owner, once, and no unrelated user', async () => {
    harness = await startHarness();

    await harness.publish(bookingEvent('BookingConfirmed', { ownerId: ALICE, ref: 'K7M2QP' }));

    expect(harness.inboxOf(ALICE)).toEqual([
      expect.objectContaining({ title: 'Booking K7M2QP confirmed' }),
    ]);
    expect(harness.inboxOf(BOB)).toEqual([]);
    expect(harness.repository.notifications).toHaveLength(1);
  });

  it('US-NT-01-T02 an airline cancellation creates nothing here', async () => {
    harness = await startHarness();

    await harness.publish(bookingCancelled({ reason: 'AIRLINE' }));

    expect(harness.repository.notifications).toEqual([]);
  });

  it('US-NT-01-T03 the same event delivered twice creates one notification', async () => {
    harness = await startHarness();
    const event = bookingEvent('BookingConfirmed');

    await harness.publish(event);
    await harness.publish(event);

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
  });

  it('US-NT-01-T03 two deliveries racing each other still create one notification', async () => {
    harness = await startHarness();
    const event = bookingEvent('BookingConfirmed');

    await Promise.all([harness.publish(event), harness.publish(event)]);

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
  });

  it('US-NT-01-T03 a different event about the same booking is a new notification', async () => {
    harness = await startHarness();
    const bookingId = '44444444-4444-4444-8444-444444444444';

    await harness.publish(bookingEvent('BookingConfirmed', { bookingId }));
    await harness.publish(bookingCancelled({ bookingId }));

    expect(harness.inboxOf(ALICE).map((n) => n.type)).toEqual([
      'BookingConfirmed',
      'BookingCancelled',
    ]);
  });

  it('US-NT-01-T04 / NFR-OBS-01-T01 a failure while storing does not fail the publisher, and is logged with the event ID', async () => {
    harness = await startHarness();
    vi.spyOn(harness.repository, 'insertIgnoringDuplicate').mockRejectedValue(
      new Error('database down'),
    );
    const event = bookingEvent('BookingConfirmed');

    // The publisher's own action (here: just awaiting the publish) completes normally.
    await expect(harness.publish(event)).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: event.eventId,
        eventType: 'BookingConfirmed',
        err: expect.objectContaining({ message: 'database down' }),
      }),
      'Notification handler failed',
    );
  });
});

describe('US-NT-02 Get flight status notifications', () => {
  it('US-NT-02-T01 a delay notifies every affected owner; US-NT-02-T03 and nobody else', async () => {
    harness = await startHarness();

    await harness.publish(flightDelayed({ affectedUserIds: [ALICE, BOB] }));

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
    expect(harness.inboxOf(BOB)).toHaveLength(1);
    expect(harness.inboxOf(CARA)).toEqual([]); // Cara has no active booking on the flight
  });

  it('US-NT-02-T01 a cancellation notifies every affected owner', async () => {
    harness = await startHarness();

    await harness.publish(flightCancelled({ affectedUserIds: [ALICE, BOB] }));

    expect(harness.inboxOf(ALICE)[0]).toMatchObject({ type: 'FlightCancelled' });
    expect(harness.inboxOf(BOB)[0]).toMatchObject({ type: 'FlightCancelled' });
  });

  it('US-NT-02-T01 a traveler with two bookings on the flight is notified once', async () => {
    harness = await startHarness();

    await harness.publish(flightDelayed({ affectedUserIds: [ALICE, ALICE, BOB] }));

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
  });

  it('US-NT-02-T01 the same delay delivered twice notifies each owner once', async () => {
    harness = await startHarness();
    const event = flightDelayed({ affectedUserIds: [ALICE, BOB] });

    await harness.publish(event);
    await harness.publish(event);

    expect(harness.repository.notifications).toHaveLength(2);
  });

  it('US-NT-02-T01 an airline cancellation tells each traveler once, not once per event', async () => {
    harness = await startHarness();
    const flight = flightCancelled({ affectedUserIds: [ALICE] });

    // What Booking and Administration publish together when an airline cancels a flight.
    await harness.publish(flight);
    await harness.publish(bookingCancelled({ ownerId: ALICE, reason: 'AIRLINE' }));

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
  });

  it('US-NT-02-T01 a failure for one recipient does not stop the others being told', async () => {
    harness = await startHarness();
    const insert = harness.repository.insertIgnoringDuplicate.bind(harness.repository);
    vi.spyOn(harness.repository, 'insertIgnoringDuplicate').mockImplementation((notification) =>
      notification.userId === ALICE ? Promise.reject(new Error('bad row')) : insert(notification),
    );

    await expect(
      harness.publish(flightDelayed({ affectedUserIds: [ALICE, BOB] })),
    ).resolves.toBeUndefined();

    expect(harness.inboxOf(BOB)).toHaveLength(1);
    expect(logged).toHaveBeenCalledTimes(1);
  });
});

describe('NFR-INTEROP-01 the email/SMS gateway is isolated from the main flow (M1 NFR 5)', () => {
  it('NFR-INTEROP-01-T01 a new notification is also sent through the gateway channel', async () => {
    const gateway = new RecordingChannel();
    harness = await startHarness([gateway]);

    await harness.publish(bookingEvent('BookingConfirmed', { ref: 'K7M2QP' }));
    await harness.dispatcher.drain();

    expect(gateway.sent).toEqual([
      expect.objectContaining({ userId: ALICE, title: 'Booking K7M2QP confirmed' }),
    ]);
  });

  it('NFR-INTEROP-01-T02 a duplicate event is not sent to the gateway a second time', async () => {
    const gateway = new RecordingChannel();
    harness = await startHarness([gateway]);
    const event = bookingEvent('BookingConfirmed');

    await harness.publish(event);
    await harness.publish(event);
    await harness.dispatcher.drain();

    expect(gateway.sent).toHaveLength(1);
  });

  it('NFR-INTEROP-01-T03 fault injection: gateway down, the publisher still succeeds and the in-app notification is stored', async () => {
    const gateway: NotificationChannel = {
      name: 'broken-gateway',
      send: () => Promise.reject(new Error('gateway unreachable')),
    };
    harness = await startHarness([gateway]);

    await expect(harness.publish(bookingEvent('BookingConfirmed'))).resolves.toBeUndefined();
    await harness.dispatcher.drain();

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'broken-gateway',
        err: expect.objectContaining({ message: 'gateway unreachable' }),
      }),
      'Channel delivery failed',
    );
  });

  it('NFR-INTEROP-01-T03 a gateway that throws synchronously is isolated too', async () => {
    const gateway: NotificationChannel = {
      name: 'throwing-gateway',
      send: () => {
        throw new Error('boom');
      },
    };
    harness = await startHarness([gateway]);

    await expect(harness.publish(bookingEvent('BookingConfirmed'))).resolves.toBeUndefined();
    await harness.dispatcher.drain();

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
  });

  it('NFR-INTEROP-01-T04 a gateway that never answers does not hold up the publisher', async () => {
    const gateway: NotificationChannel = { name: 'hanging', send: () => new Promise(() => {}) };
    harness = await startHarness([gateway]);

    // If publish waited for the gateway, this would never resolve and the test would time out.
    await harness.publish(bookingEvent('BookingConfirmed'));

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
  });

  it('NFR-INTEROP-01-T05 one failing channel does not stop the others', async () => {
    const working = new RecordingChannel();
    const broken: NotificationChannel = {
      name: 'broken',
      send: () => Promise.reject(new Error('down')),
    };
    harness = await startHarness([broken, working]);

    await harness.publish(bookingEvent('BookingConfirmed'));
    await harness.dispatcher.drain();

    expect(working.sent).toHaveLength(1);
  });
});

describe('US-NT-07 email through the real event path', () => {
  const ADDRESSES: Record<string, string> = {
    [ALICE]: 'alice@example.com',
    [BOB]: 'bob@example.com',
  };
  const directory = { emailOf: (userId: string) => Promise.resolve(ADDRESSES[userId] ?? null) };

  it('US-NT-07-T01 an event emails only the traveler who opted in, and everyone still gets the in-app notification', async () => {
    const preferences = new InMemoryPreferencesRepository();
    const mail = new LocalMailCatcher();
    await preferences.setEmail(ALICE, 'FlightDelayed', true); // Bob has not opted in
    harness = await startHarness([new EmailChannel(preferences, directory, mail)]);

    await harness.publish(flightDelayed({ affectedUserIds: [ALICE, BOB] }));
    await harness.dispatcher.drain();

    expect(mail.outbox.map((message) => message.to)).toEqual(['alice@example.com']);
    expect(harness.inboxOf(ALICE)).toHaveLength(1);
    expect(harness.inboxOf(BOB)).toHaveLength(1);
  });

  it('US-NT-07-T02 fault injection: the email transport is down, yet the in-app notification is stored and the publisher succeeds', async () => {
    const preferences = new InMemoryPreferencesRepository();
    await preferences.setEmail(ALICE, 'BookingConfirmed', true);
    const brokenMail = { send: () => Promise.reject(new Error('smtp unreachable')) };
    harness = await startHarness([new EmailChannel(preferences, directory, brokenMail)]);

    await expect(harness.publish(bookingEvent('BookingConfirmed'))).resolves.toBeUndefined();
    await harness.dispatcher.drain();

    expect(harness.inboxOf(ALICE)).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        err: expect.objectContaining({ message: 'smtp unreachable' }),
      }),
      'Channel delivery failed',
    );
  });

  it('US-NT-07-T01 the same event delivered twice emails once', async () => {
    const preferences = new InMemoryPreferencesRepository();
    const mail = new LocalMailCatcher();
    await preferences.setEmail(ALICE, 'BookingConfirmed', true);
    harness = await startHarness([new EmailChannel(preferences, directory, mail)]);
    const event = bookingEvent('BookingConfirmed');

    await harness.publish(event);
    await harness.publish(event);
    await harness.dispatcher.drain();

    expect(mail.outbox).toHaveLength(1);
  });
});
