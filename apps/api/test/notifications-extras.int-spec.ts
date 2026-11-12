import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEPARTURE_SOURCE,
  EMAIL_DIRECTORY,
  MAIL_TRANSPORT,
  NOTIFICATIONS_API,
  type MailTransport,
  type NotificationsApi,
  type UpcomingDeparture,
} from '../src/modules/notifications/index';
import { publishDomainEvent } from '../src/shared/events';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'correct horse battery';
const HOUR = 60 * 60 * 1000;

interface Traveler {
  id: string;
  email: string;
  cookie: string;
}

/**
 * The reminder and email features, over HTTP and a real PostgreSQL. Booking and Users and Access
 * are not built yet, so the two things they will provide (upcoming departures and email
 * addresses) are replaced here through the module's public tokens, exactly as their owners will.
 */
describe('Notifications reminders and email', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let notifications: NotificationsApi;
  let departures: UpcomingDeparture[] = [];
  const addresses = new Map<string, string>();
  let counter = 0;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DEPARTURE_SOURCE)
      .useValue({ ticketedDeparturesBetween: () => Promise.resolve(departures) })
      .overrideProvider(EMAIL_DIRECTORY)
      .useValue({ emailOf: (userId: string) => Promise.resolve(addresses.get(userId) ?? null) })
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
    notifications = app.get<NotificationsApi>(NOTIFICATIONS_API);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  const server = () => request(app.getHttpServer());
  const withCookie = <T extends request.Test>(pending: T, cookie?: string) =>
    cookie ? pending.set('cookie', cookie) : pending;
  const get = (url: string, cookie?: string) => withCookie(server().get(url), cookie);
  const put = (url: string, cookie?: string) =>
    withCookie(server().put(url).set('x-requested-with', 'fetch'), cookie);

  const cookieOf = (response: Response) =>
    (response.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('flight_session='))!
      .split(';')[0];

  async function newTraveler(): Promise<Traveler> {
    const email = `extras${++counter}@example.com`;
    await server()
      .post('/users/register')
      .set('x-requested-with', 'fetch')
      .send({ email, password: PASSWORD, name: 'Test Traveler' })
      .expect(201);
    const signedIn = await server()
      .post('/users/sign-in')
      .set('x-requested-with', 'fetch')
      .send({ email, password: PASSWORD })
      .expect(200);
    const id = (signedIn.body as { id: string }).id;
    addresses.set(id, email);
    return { id, email, cookie: cookieOf(signedIn) };
  }

  const inbox = async (traveler: Traveler) =>
    (await get('/notifications', traveler.cookie).expect(200)).body as {
      items: { type: string; title: string; body: string }[];
      total: number;
    };

  const upcoming = (
    ownerId: string,
    hoursAway: number,
    overrides: Partial<UpcomingDeparture> = {},
  ) => ({
    bookingId: randomUUID(),
    ownerId,
    ref: `R${++counter}`,
    flightNumber: 'MS123',
    departureUtc: new Date(Date.now() + hoursAway * HOUR).toISOString(),
    departureTimeZone: 'Africa/Cairo',
    bookingStatus: 'TICKETED',
    flightStatus: 'SCHEDULED',
    ...overrides,
  });

  describe('US-NT-07 email preferences over HTTP', () => {
    it('US-NT-07-T04 every notification type is listed, all off for a new traveler', async () => {
      const alice = await newTraveler();

      const { preferences } = (await get('/notifications/preferences', alice.cookie).expect(200))
        .body as {
        preferences: { type: string; email: boolean }[];
      };

      expect(preferences.map((p) => p.type)).toEqual([
        'BookingConfirmed',
        'TicketsIssued',
        'BookingExpired',
        'BookingCancelled',
        'FlightDelayed',
        'FlightCancelled',
        'DepartureReminder',
      ]);
      expect(preferences.every((p) => p.email === false)).toBe(true);
    });

    it('US-NT-07-T04 opting in is saved for that traveler and that type only', async () => {
      const [alice, bob] = [await newTraveler(), await newTraveler()];

      await put('/notifications/preferences/FlightDelayed', alice.cookie)
        .send({ email: true })
        .expect(204);

      const read = async (who: Traveler) =>
        (
          (await get('/notifications/preferences', who.cookie).expect(200)).body as {
            preferences: { type: string; email: boolean }[];
          }
        ).preferences
          .filter((p) => p.email)
          .map((p) => p.type);
      expect(await read(alice)).toEqual(['FlightDelayed']);
      expect(await read(bob)).toEqual([]);
    });

    it('US-NT-07-T04 changing your mind and repeating the request are both fine', async () => {
      const alice = await newTraveler();

      await put('/notifications/preferences/FlightDelayed', alice.cookie)
        .send({ email: true })
        .expect(204);
      await put('/notifications/preferences/FlightDelayed', alice.cookie)
        .send({ email: true })
        .expect(204);
      await put('/notifications/preferences/FlightDelayed', alice.cookie)
        .send({ email: false })
        .expect(204);

      const { preferences } = (await get('/notifications/preferences', alice.cookie)).body as {
        preferences: { email: boolean }[];
      };
      expect(preferences.some((p) => p.email)).toBe(false);
    });

    it('US-NT-07-T04 an unknown type is a 404, and a body that is not true or false is a 400', async () => {
      const alice = await newTraveler();

      await put('/notifications/preferences/Nonsense', alice.cookie)
        .send({ email: true })
        .expect(404);
      for (const body of [{}, { email: 'yes' }, { email: 1 }]) {
        const response = await put('/notifications/preferences/FlightDelayed', alice.cookie).send(
          body,
        );
        expect({ body, status: response.status }).toEqual({ body, status: 400 });
      }
    });

    it('US-NT-07-T04 preferences need a signed-in user', async () => {
      await get('/notifications/preferences').expect(401);
      await put('/notifications/preferences/FlightDelayed').send({ email: true }).expect(401);
    });
  });

  describe('US-NT-07 email delivery end to end', () => {
    async function publishConfirmed(traveler: Traveler) {
      await publishDomainEvent(app.get(EventEmitter2), {
        type: 'BookingConfirmed',
        eventId: randomUUID(),
        bookingId: randomUUID(),
        ownerId: traveler.id,
        ref: 'EMAIL1',
      });
    }
    const outbox = () =>
      (app.get<MailTransport>(MAIL_TRANSPORT) as unknown as { outbox: { to: string }[] }).outbox;

    it('US-NT-07-T05 a traveler who opted in gets the email as well as the in-app notification', async () => {
      const alice = await newTraveler();
      await put('/notifications/preferences/BookingConfirmed', alice.cookie)
        .send({ email: true })
        .expect(204);

      await publishConfirmed(alice);

      await vi.waitFor(() => expect(outbox().filter((m) => m.to === alice.email)).toHaveLength(1));
      expect((await inbox(alice)).total).toBe(1);
    });

    it('US-NT-07-T05 a traveler who did not opt in gets only the in-app notification', async () => {
      const bob = await newTraveler();

      await publishConfirmed(bob);
      await new Promise((resolve) => setTimeout(resolve, 150)); // give a wrongly sent email time to appear

      expect((await inbox(bob)).total).toBe(1);
      expect(outbox().filter((m) => m.to === bob.email)).toEqual([]);
    });
  });

  describe('US-NT-06 departure reminders against PostgreSQL', () => {
    it('US-NT-06-T04 a ticketed booking departing in 23.5 hours is reminded and sees it in the inbox', async () => {
      const alice = await newTraveler();
      departures = [upcoming(alice.id, 23.5, { ref: 'REMIND' })];

      expect(await notifications.sendDepartureReminders(new Date())).toBe(1);

      const { items } = await inbox(alice);
      expect(items).toEqual([
        expect.objectContaining({
          type: 'DepartureReminder',
          title: 'Flight MS123 departs tomorrow',
        }),
      ]);
      expect(items[0].body).toContain('REMIND');
    });

    it('US-NT-06-T05 running the job again and again reminds once, thanks to the unique key', async () => {
      const alice = await newTraveler();
      departures = [upcoming(alice.id, 23.5)];

      const counts = [];
      for (let run = 0; run < 3; run += 1)
        counts.push(await notifications.sendDepartureReminders(new Date()));

      expect(counts).toEqual([1, 0, 0]);
      expect((await inbox(alice)).total).toBe(1);
    });

    it('NFR-REL-02-T03 two runs at the same moment against PostgreSQL still send one reminder', async () => {
      const alice = await newTraveler();
      departures = [upcoming(alice.id, 23.5)];
      const now = new Date();

      const [first, second] = await Promise.all([
        notifications.sendDepartureReminders(now),
        notifications.sendDepartureReminders(now),
      ]);

      expect(first + second).toBe(1);
      expect((await inbox(alice)).total).toBe(1);
    });

    it('US-NT-06-T06 a cancelled flight, an unticketed booking and a flight outside the window get nothing', async () => {
      const alice = await newTraveler();
      departures = [
        upcoming(alice.id, 23.5, { flightStatus: 'CANCELLED' }),
        upcoming(alice.id, 23.5, { bookingStatus: 'CANCELLED' }),
        upcoming(alice.id, 23.5, { bookingStatus: 'PENDING_PAYMENT' }),
        upcoming(alice.id, 30),
        upcoming(alice.id, 10),
      ];

      expect(await notifications.sendDepartureReminders(new Date())).toBe(0);
      expect((await inbox(alice)).total).toBe(0);
    });

    it('NFR-REL-02-T04 the reminder job is registered with the scheduler and runs at least every 15 minutes', () => {
      const job = app.get(SchedulerRegistry).getCronJob('departure-reminders');
      const [first, second] = job.nextDates(2).map((date) => date.toMillis());

      expect(second - first).toBeLessThanOrEqual(15 * 60 * 1000);
    });
  });
});
