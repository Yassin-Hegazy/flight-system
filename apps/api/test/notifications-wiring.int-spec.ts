import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CATALOG_API, type CatalogApi } from '../src/modules/flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../src/modules/inventory/index';
import {
  DEPARTURE_REMINDERS_API,
  MAIL_TRANSPORT,
  type DepartureRemindersApi,
  type MailTransport,
} from '../src/modules/notifications/index';
import { money } from '../src/shared/money';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'correct horse battery';
const HOUR_MS = 3_600_000;

/**
 * Reminders and email with the real modules behind Notifications' ports: Booking and the Catalog
 * supply upcoming departures, Users and Access supplies addresses. Nothing is overridden.
 */
describe('Notifications wired to Booking, the Catalog and Users and Access', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let db: DataSource;
  let counter = 0;

  const server = () => request(app.getHttpServer());
  const post = (path: string, cookie: string) =>
    server().post(path).set('x-requested-with', 'fetch').set('cookie', cookie);

  async function traveler(): Promise<{ email: string; cookie: string }> {
    const email = `wired${++counter}@example.com`;
    await post('/users/register', '')
      .send({ email, password: PASSWORD, name: 'Mona Adel' })
      .expect(201);
    const login = await post('/users/sign-in', '').send({ email, password: PASSWORD }).expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('flight_session='))!
      .split(';')[0];
    return { email, cookie };
  }

  async function flight(origin: string, destination: string, hours: number): Promise<string> {
    counter += 1;
    const departure = Date.now() + hours * HOUR_MS;
    return db.transaction('READ COMMITTED', async (tx) => {
      const created = await app.get<CatalogApi>(CATALOG_API).createFlight(tx, {
        flightNumber: `MS${3000 + counter}`,
        airlineCode: 'MS',
        originCode: origin,
        destinationCode: destination,
        scheduledDepartureUtc: new Date(departure),
        scheduledArrivalUtc: new Date(departure + 5 * HOUR_MS),
        fares: { ECONOMY: money(1_500_000, 'EGP'), BUSINESS: money(4_500_000, 'EGP') },
      });
      if (!created.ok) throw new Error(created.error);
      await app.get<InventoryApi>(INVENTORY_API).setCapacity(tx, created.value, 'ECONOMY', 20);
      return created.value;
    });
  }

  /** Books and pays, then waits for Ticketing to issue the tickets. */
  async function ticketed(cookie: string, flightId: string, returnFlightId?: string) {
    const booked = await post('/bookings', cookie)
      .send({ flightId, returnFlightId, cabin: 'ECONOMY' })
      .expect(201);
    const reference = (booked.body as { reference: string }).reference;
    await post(`/bookings/${reference}/payments`, cookie)
      .set('idempotency-key', randomUUID())
      .send({ token: 'tok_success' })
      .expect(201);
    await vi.waitFor(async () => {
      const view = await server().get(`/bookings/${reference}`).set('cookie', cookie);
      expect((view.body as { status: string }).status).toBe('TICKETED');
    });
    return reference;
  }

  async function inbox(cookie: string): Promise<{ type: string; body: string }[]> {
    const page = await server().get('/notifications').set('cookie', cookie).expect(200);
    return (page.body as { items: { type: string; body: string }[] }).items;
  }

  const reminders = () => app.get<DepartureRemindersApi>(DEPARTURE_REMINDERS_API);

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('US-NT-06-T07 a ticketed booking whose flight leaves in about 23.5 hours is reminded', async () => {
    const { cookie } = await traveler();
    const reference = await ticketed(cookie, await flight('CAI', 'LHR', 23.5));

    expect(await reminders().sendDueReminders(new Date())).toBeGreaterThanOrEqual(1);

    const reminded = (await inbox(cookie)).filter((item) => item.type === 'DepartureReminder');
    expect(reminded).toHaveLength(1);
    expect(reminded[0].body).toContain(reference);
  });

  it('US-NT-06-T08 a round trip is reminded before each leg, once per leg', async () => {
    const { cookie } = await traveler();
    const out = await flight('CAI', 'LHR', 23.5);
    const back = await flight('LHR', 'CAI', 47.5);
    await ticketed(cookie, out, back);

    await reminders().sendDueReminders(new Date());
    await reminders().sendDueReminders(new Date());
    await reminders().sendDueReminders(new Date(Date.now() + 24 * HOUR_MS));

    const reminded = (await inbox(cookie)).filter((item) => item.type === 'DepartureReminder');
    expect(reminded).toHaveLength(2);
  });

  it('US-NT-06-T09 a booking that is not ticketed is not reminded', async () => {
    const { cookie } = await traveler();
    await post('/bookings', cookie)
      .send({ flightId: await flight('CAI', 'LHR', 23.5), cabin: 'ECONOMY' })
      .expect(201);

    await reminders().sendDueReminders(new Date());

    expect((await inbox(cookie)).filter((item) => item.type === 'DepartureReminder')).toEqual([]);
  });

  it('US-NT-07-T06 a traveler who opted in gets the email at their account address', async () => {
    const { email, cookie } = await traveler();
    await server()
      .put('/notifications/preferences/BookingConfirmed')
      .set('x-requested-with', 'fetch')
      .set('cookie', cookie)
      .send({ email: true })
      .expect(204);

    await ticketed(cookie, await flight('CAI', 'LHR', 72));

    const outbox = () =>
      (app.get<MailTransport>(MAIL_TRANSPORT) as unknown as { outbox: { to: string }[] }).outbox;
    await vi.waitFor(() => expect(outbox().filter((mail) => mail.to === email)).toHaveLength(1));
  });
});
