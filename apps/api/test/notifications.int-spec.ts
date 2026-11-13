import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAdmin } from '../src/database/seed-admin';
import { type DomainEvent, publishDomainEvent } from '../src/shared/events';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'correct horse battery';

interface Traveler {
  id: string;
  cookie: string;
}

interface InboxBody {
  items: {
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    readAt: string | null;
  }[];
  unread: number;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Notifications end to end over HTTP and a real PostgreSQL: domain events go in through the same
 * emitter the other modules use, and the inbox comes out of the API.
 */
describe('Notifications over HTTP', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let emitter: EventEmitter2;
  let counter = 0;

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    emitter = app.get(EventEmitter2);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  const server = () => request(app.getHttpServer());
  const get = (url: string, cookie?: string) => {
    const pending = server().get(url);
    return cookie ? pending.set('cookie', cookie) : pending;
  };
  // State-changing requests carry X-Requested-With, as the web app sends it (NFR-SEC-04).
  const patch = (url: string, cookie?: string) => {
    const pending = server().patch(url).set('x-requested-with', 'fetch');
    return cookie ? pending.set('cookie', cookie) : pending;
  };
  const post = (url: string, cookie?: string) => {
    const pending = server().post(url).set('x-requested-with', 'fetch');
    return cookie ? pending.set('cookie', cookie) : pending;
  };

  const cookieOf = (response: Response) =>
    (response.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('flight_session='))!
      .split(';')[0];

  /** Registers and signs in a new traveler, so every test has users of its own. */
  async function newTraveler(): Promise<Traveler> {
    const email = `notify${++counter}@example.com`;
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
    return { id: (signedIn.body as { id: string }).id, cookie: cookieOf(signedIn) };
  }

  const publish = (event: DomainEvent) => publishDomainEvent(emitter, event);

  const confirmed = (ownerId: string, ref = `R${++counter}`): DomainEvent => ({
    type: 'BookingConfirmed',
    eventId: randomUUID(),
    bookingId: randomUUID(),
    ownerId,
    ref,
  });

  const inboxOf = async (traveler: Traveler, page = 1) =>
    (await get(`/notifications?page=${page}`, traveler.cookie).expect(200)).body as InboxBody;

  describe('US-NT-01 / US-NT-04 booking notifications reach the owner’s inbox', () => {
    it('US-NT-04-T01 a confirmed booking appears in its owner’s inbox only', async () => {
      const [alice, bob] = [await newTraveler(), await newTraveler()];

      await publish(confirmed(alice.id, 'K7M2QP'));

      const aliceInbox = await inboxOf(alice);
      expect(aliceInbox.items).toEqual([
        expect.objectContaining({
          type: 'BookingConfirmed',
          title: 'Booking K7M2QP confirmed',
          read: false,
          readAt: null,
        }),
      ]);
      expect(aliceInbox.unread).toBe(1);
      expect(await inboxOf(bob)).toMatchObject({ items: [], unread: 0, total: 0 });
    });

    it('US-NT-01-T03 the same event delivered twice, even at once, is stored once (unique key)', async () => {
      const alice = await newTraveler();
      const event = confirmed(alice.id);

      await Promise.all([publish(event), publish(event)]);
      await publish(event);

      expect((await inboxOf(alice)).total).toBe(1);
    });

    it('US-NT-04-T01 the inbox is newest first and pages hold 20', async () => {
      const alice = await newTraveler();
      for (let i = 1; i <= 25; i += 1) await publish(confirmed(alice.id, `REF${i}`));

      const first = await inboxOf(alice, 1);
      const second = await inboxOf(alice, 2);

      expect(first.items).toHaveLength(20);
      expect(second.items).toHaveLength(5);
      expect(first.items[0].title).toBe('Booking REF25 confirmed');
      expect(second.items.at(-1)?.title).toBe('Booking REF1 confirmed');
      expect(first).toMatchObject({ total: 25, unread: 25, page: 1, pageSize: 20 });
    });

    it('US-NT-04-T01 an invalid page number is a 400, not a server error', async () => {
      const alice = await newTraveler();

      for (const page of ['0', '-1', 'abc', '1.5']) {
        const response = await get(`/notifications?page=${page}`, alice.cookie);
        expect({ page, status: response.status }).toEqual({ page, status: 400 });
      }
    });

    it('US-NT-04-T01 the inbox needs a signed-in user', async () => {
      await get('/notifications').expect(401);
    });
  });

  describe('US-NT-02 flight status notifications', () => {
    it('US-NT-02-T01 a delay reaches the affected owners; US-NT-02-T03 others receive nothing', async () => {
      const [alice, bob, cara] = [await newTraveler(), await newTraveler(), await newTraveler()];

      await publish({
        type: 'FlightDelayed',
        eventId: randomUUID(),
        flightId: randomUUID(),
        flightNumber: 'MS123',
        departureTimeZone: 'Africa/Cairo',
        oldDepartureUtc: '2026-12-10T07:00:00.000Z',
        newDepartureUtc: '2026-12-10T09:30:00.000Z',
        affectedUserIds: [alice.id, bob.id],
      });

      const aliceInbox = await inboxOf(alice);
      expect(aliceInbox.items[0]).toMatchObject({
        type: 'FlightDelayed',
        title: 'Flight MS123 delayed',
      });
      expect(aliceInbox.items[0].body).toContain('2026-12-10 09:00+02:00');
      expect(aliceInbox.items[0].body).toContain('2026-12-10 11:30+02:00');
      expect((await inboxOf(bob)).total).toBe(1);
      expect((await inboxOf(cara)).total).toBe(0);
    });

    it('US-NT-02-T01 an airline cancellation tells each traveler once', async () => {
      const alice = await newTraveler();

      await publish({
        type: 'FlightCancelled',
        eventId: randomUUID(),
        flightId: randomUUID(),
        flightNumber: 'MS123',
        departureTimeZone: 'Africa/Cairo',
        departureUtc: '2026-12-10T07:00:00.000Z',
        affectedUserIds: [alice.id],
      });
      await publish({
        type: 'BookingCancelled',
        eventId: randomUUID(),
        bookingId: randomUUID(),
        ownerId: alice.id,
        ref: 'K7M2QP',
        reason: 'AIRLINE',
      });

      const inbox = await inboxOf(alice);
      expect(inbox.items.map((item) => item.type)).toEqual(['FlightCancelled']);
    });
  });

  describe('US-NT-03 mark a notification as read', () => {
    it('US-NT-03-T01 changes only that notification; US-NT-04-T02 the unread count drops', async () => {
      const alice = await newTraveler();
      await publish(confirmed(alice.id, 'ONE'));
      await publish(confirmed(alice.id, 'TWO'));
      const before = await inboxOf(alice);
      const target = before.items.find((item) => item.title.includes('ONE'))!;

      await patch(`/notifications/${target.id}/read`, alice.cookie).expect(204);

      const after = await inboxOf(alice);
      expect(after.unread).toBe(1);
      expect(after.items.find((item) => item.id === target.id)).toMatchObject({ read: true });
      expect(after.items.find((item) => item.title.includes('TWO'))).toMatchObject({
        read: false,
        readAt: null,
      });
    });

    it('US-NT-03-T03 reading it again changes nothing: the first read time is kept', async () => {
      const alice = await newTraveler();
      await publish(confirmed(alice.id));
      const [item] = (await inboxOf(alice)).items;

      await patch(`/notifications/${item.id}/read`, alice.cookie).expect(204);
      const firstRead = (await inboxOf(alice)).items[0].readAt;
      await patch(`/notifications/${item.id}/read`, alice.cookie).expect(204);

      expect(firstRead).not.toBeNull();
      expect((await inboxOf(alice)).items[0].readAt).toBe(firstRead);
    });

    it('US-NT-03-T02 another user’s notification answers exactly like a missing one, and stays unread', async () => {
      const [alice, bob] = [await newTraveler(), await newTraveler()];
      await publish(confirmed(alice.id));
      const [alices] = (await inboxOf(alice)).items;

      const theirs = await patch(`/notifications/${alices.id}/read`, bob.cookie);
      const missing = await patch(`/notifications/${randomUUID()}/read`, bob.cookie);
      const malformed = await patch('/notifications/not-a-uuid/read', bob.cookie);

      expect(theirs.status).toBe(404);
      expect({ ...theirs.body, requestId: null }).toEqual({ ...missing.body, requestId: null });
      expect({ ...malformed.body, requestId: null }).toEqual({ ...missing.body, requestId: null });
      expect((await inboxOf(alice)).unread).toBe(1);
    });

    it('US-NT-03-T02 an administrator gets no exception: it is not theirs either', async () => {
      const alice = await newTraveler();
      await publish(confirmed(alice.id));
      const [alices] = (await inboxOf(alice)).items;
      const email = `admin${++counter}@example.com`;
      await seedAdmin(app, { email, password: PASSWORD, name: 'Notify Admin' });
      const adminCookie = cookieOf(
        await server()
          .post('/users/sign-in')
          .set('x-requested-with', 'fetch')
          .send({ email, password: PASSWORD })
          .expect(200),
      );

      await patch(`/notifications/${alices.id}/read`, adminCookie).expect(404);
    });

    it('US-NT-03-T02 marking read needs a signed-in user, whatever the ID looks like', async () => {
      await patch(`/notifications/${randomUUID()}/read`).expect(401);
      await patch('/notifications/not-a-uuid/read').expect(401);
    });
  });

  describe('US-NT-05 mark all as read', () => {
    it('US-NT-05-T01 marks every unread notification of the user and touches no one else’s', async () => {
      const [alice, bob] = [await newTraveler(), await newTraveler()];
      for (let i = 0; i < 3; i += 1) await publish(confirmed(alice.id));
      await publish(confirmed(bob.id));

      const result = await post('/notifications/read-all', alice.cookie).expect(200);

      expect(result.body).toEqual({ updated: 3 });
      expect((await inboxOf(alice)).unread).toBe(0);
      expect((await inboxOf(bob)).unread).toBe(1);
    });

    it('US-NT-05-T01 needs a signed-in user', async () => {
      await post('/notifications/read-all').expect(401);
    });
  });
});
