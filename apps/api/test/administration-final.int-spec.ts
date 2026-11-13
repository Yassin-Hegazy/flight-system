import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAdmin } from '../src/database/seed-admin';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'correct horse battery';
const TEMPLATE = {
  flightNumber: 'MS730',
  airlineCode: 'MS',
  originCode: 'CAI',
  destinationCode: 'LHR',
  currency: 'EGP',
  fares: { ECONOMY: 1_000_000, BUSINESS: 3_000_000 },
  capacity: { ECONOMY: 3, BUSINESS: 0 },
};

describe('Administration final stories', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let db: DataSource;
  let admin: string;
  let traveler: string;
  let flightId: string;
  let paidReference: string;
  let heldReference: string;
  let ticketNumber: string;

  const server = () => request(app.getHttpServer());
  const write = (method: 'post' | 'put' | 'patch' | 'delete', path: string, cookie = admin) =>
    server()[method](path).set('cookie', cookie).set('x-requested-with', 'fetch');
  const get = (path: string, cookie = admin) => server().get(path).set('cookie', cookie);
  const flightPath = () => `/admin/flights/${flightId}`;

  async function signIn(email: string) {
    const response = await server()
      .post('/users/sign-in')
      .set('x-requested-with', 'fetch')
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((cookie) => cookie.startsWith('flight_session='))!.split(';')[0];
  }

  async function createFlight(departure: Date, flightNumber = TEMPLATE.flightNumber) {
    const response = await write('post', '/admin/flights')
      .send({
        ...TEMPLATE,
        flightNumber,
        scheduledDepartureUtc: departure.toISOString(),
        scheduledArrivalUtc: new Date(departure.getTime() + 18_000_000).toISOString(),
      })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  async function reserve() {
    const response = await write('post', '/bookings', traveler)
      .send({ flightId, cabin: 'ECONOMY' })
      .expect(201);
    return response.body as { reference: string; amount: { amountMinor: number } };
  }

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    await app.listen(0, '127.0.0.1');
    db = app.get(DataSource);
    await seedAdmin(app, {
      email: 'admin-final@example.com',
      password: PASSWORD,
      name: 'Administrator',
    });
    await server()
      .post('/users/register')
      .set('x-requested-with', 'fetch')
      .send({ email: 'manifest@example.com', password: PASSWORD, name: 'Passenger One' })
      .expect(201);
    admin = await signIn('admin-final@example.com');
    traveler = await signIn('manifest@example.com');
    flightId = await createFlight(new Date(Date.now() + 48 * 3_600_000));
    paidReference = (await reserve()).reference;
    heldReference = (await reserve()).reference;
    await write('post', `/bookings/${paidReference}/payments`, traveler)
      .set('idempotency-key', randomUUID())
      .send({ token: 'tok_success' })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('US-AD-03-T02 rejects a shrink below sold and held, accepts the exact boundary, and preserves fare snapshots', async () => {
    const path = `${flightPath()}/capacity/ECONOMY`;
    const rejected = await write('put', path).send({ capacity: 1 }).expect(409);
    expect(rejected.body).toMatchObject({
      code: 'BELOW_SOLD',
      fieldErrors: { committedSeats: '1', activeHeldSeats: '1' },
    });
    await write('put', path).send({ capacity: 2 }).expect(200);
    await write('put', path).send({ capacity: 3 }).expect(200);

    const fare = `${flightPath()}/fares/ECONOMY`;
    await write('put', fare).send({ amountMinor: 10, currency: 'USD' }).expect(400);
    await write('put', fare).send({ amountMinor: 0, currency: 'EGP' }).expect(400);
    await write('put', fare).send({ amountMinor: 1.5, currency: 'EGP' }).expect(400);
    await write('put', fare).send({ amountMinor: 1_200_000, currency: 'EGP' }).expect(200);
    const old = await get(`/bookings/${heldReference}`, traveler).expect(200);
    expect(old.body).toMatchObject({ amount: { amountMinor: 1_000_000 } });
    expect((await reserve()).amount.amountMinor).toBe(1_200_000);
  });

  it('US-AD-05-T01 returns cabin totals and only confirmed passengers with ticket numbers', async () => {
    const load = await get(`${flightPath()}/load`).expect(200);
    expect(load.body).toMatchObject([
      { cabin: 'ECONOMY', capacity: 3, committedSeats: 1, activeHeldSeats: 2, availableSeats: 0 },
      { cabin: 'BUSINESS', capacity: 0, committedSeats: 0, activeHeldSeats: 0, availableSeats: 0 },
    ]);
    const manifest = await get(`${flightPath()}/manifest`)
      .expect('Cache-Control', 'no-store')
      .expect(200);
    expect(manifest.body).toEqual([
      {
        passengerName: 'Passenger One',
        bookingReference: paidReference,
        ticketNumber: expect.any(String),
        status: 'ISSUED',
      },
    ]);
    ticketNumber = (manifest.body as { ticketNumber: string }[])[0].ticketNumber;
  });

  it('US-AD-05-T02 load and manifest are for administrators only', async () => {
    for (const path of [`${flightPath()}/load`, `${flightPath()}/manifest`]) {
      await get(path, traveler).expect(403);
      await server().get(path).expect(401);
    }
  });

  it('US-AD-05-T03 over random bookings, payments, cancellations and capacity changes, the load adds up', async () => {
    const id = await createFlight(new Date(Date.now() + 96 * 3_600_000), 'MS735');
    let seed = 20261113;
    const random = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    const pending: string[] = [];
    const active: string[] = [];
    for (let step = 0; step < 20; step += 1) {
      const action = random(4);
      if (action === 0) {
        const booked = await write('post', '/bookings', traveler).send({
          flightId: id,
          cabin: 'ECONOMY',
        });
        if (booked.status === 201) {
          const { reference } = booked.body as { reference: string };
          pending.push(reference);
          active.push(reference);
        }
      } else if (action === 1 && pending.length) {
        const [reference] = pending.splice(random(pending.length), 1);
        await write('post', `/bookings/${reference}/payments`, traveler)
          .set('idempotency-key', randomUUID())
          .send({ token: 'tok_success' });
      } else if (action === 2 && active.length) {
        const [reference] = active.splice(random(active.length), 1);
        const unpaid = pending.indexOf(reference);
        if (unpaid >= 0) pending.splice(unpaid, 1);
        await write('post', `/bookings/${reference}/cancel`, traveler);
      } else {
        await write('put', `/admin/flights/${id}/capacity/ECONOMY`).send({ capacity: random(6) });
      }
      const load = (await get(`/admin/flights/${id}/load`).expect(200)).body as {
        capacity: number;
        committedSeats: number;
        activeHeldSeats: number;
        availableSeats: number;
      }[];
      for (const cabin of load) {
        expect(cabin.committedSeats + cabin.activeHeldSeats + cabin.availableSeats).toBe(
          cabin.capacity,
        );
        expect(cabin.availableSeats).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('US-AD-04-T02 an empty or blank reason is rejected and the flight is unchanged', async () => {
    for (const body of [{}, { reason: '' }, { reason: ' ' }]) {
      await write('post', `${flightPath()}/cancel`).send(body).expect(400);
    }
    expect((await get(`/flights/${flightId}`).expect(200)).body).toMatchObject({
      status: 'SCHEDULED',
    });
  });

  it('US-AD-04-T04 rolls back ticket voiding if refund recording fails and commits the full cascade on retry', async () => {
    const path = `${flightPath()}/cancel`;
    await db.query(
      `ALTER TABLE refunds ADD CONSTRAINT reject_test_refund CHECK (status <> 'PENDING') NOT VALID`,
    );
    try {
      await write('post', path).send({ reason: 'Maintenance' }).expect(500);
      expect(
        await db.query('SELECT status FROM tickets WHERE number = $1', [ticketNumber]),
      ).toEqual([{ status: 'ISSUED' }]);
      expect((await get(`/flights/${flightId}`).expect(200)).body).toMatchObject({
        status: 'SCHEDULED',
      });
    } finally {
      await db.query('ALTER TABLE refunds DROP CONSTRAINT reject_test_refund');
    }
    await write('post', path).send({ reason: 'Maintenance' }).expect(200);
    await write('post', path).send({ reason: 'Maintenance' }).expect(409);
    expect(await db.query('SELECT status FROM tickets WHERE number = $1', [ticketNumber])).toEqual([
      { status: 'VOID' },
    ]);
    expect((await get(`/flights/${flightId}`).expect(200)).body).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Maintenance',
    });
    expect(
      (await get(`/bookings/${paidReference}/receipt`, traveler).expect(200)).body,
    ).toMatchObject({ refund: { status: 'SUCCEEDED' } });
    const inbox = (await get('/notifications', traveler).expect(200)).body as {
      items: { type: string }[];
    };
    expect(inbox.items.filter(({ type }) => type === 'FlightCancelled')).toHaveLength(1);
  });

  it('US-AD-03-T05 concurrent reservation and capacity shrink cannot oversell', async () => {
    const id = await createFlight(new Date(Date.now() + 72 * 3_600_000), 'MS732');
    const [reservation, shrink] = await Promise.all([
      write('post', '/bookings', traveler).send({ flightId: id, cabin: 'ECONOMY' }),
      write('put', `/admin/flights/${id}/capacity/ECONOMY`).send({ capacity: 0 }),
    ]);
    expect([
      [201, 409],
      [409, 200],
    ]).toContainEqual([reservation.status, shrink.status]);
    const load = (await get(`/admin/flights/${id}/load`).expect(200)).body as {
      capacity: number;
      committedSeats: number;
      activeHeldSeats: number;
      availableSeats: number;
    }[];
    for (const cabin of load) {
      expect(cabin.committedSeats + cabin.activeHeldSeats + cabin.availableSeats).toBe(
        cabin.capacity,
      );
    }
  });

  it('US-AD-04-T01 one cancellation handles a confirmed, a pending and an already cancelled booking', async () => {
    const id = await createFlight(new Date(Date.now() + 72 * 3_600_000), 'MS734');
    const book = async () =>
      (
        (
          await write('post', '/bookings', traveler)
            .send({ flightId: id, cabin: 'ECONOMY' })
            .expect(201)
        ).body as { reference: string }
      ).reference;
    const [paid, pending, withdrawn] = [await book(), await book(), await book()];
    for (const reference of [paid, withdrawn]) {
      await write('post', `/bookings/${reference}/payments`, traveler)
        .set('idempotency-key', randomUUID())
        .send({ token: 'tok_success' })
        .expect(201);
    }
    // Travelers can cancel only confirmed bookings; this one is refunded once, here.
    await write('post', `/bookings/${withdrawn}/cancel`, traveler).expect(200);

    await write('post', `/admin/flights/${id}/cancel`)
      .send({ reason: 'Crew shortage' })
      .expect(200);

    for (const reference of [paid, pending, withdrawn]) {
      expect((await get(`/bookings/${reference}`, traveler).expect(200)).body).toMatchObject({
        status: 'CANCELLED',
      });
    }
    const refunds = await db.query<{ reference: string }[]>(
      `SELECT b.reference FROM refunds r JOIN payments p ON p.id = r."paymentId"
       JOIN bookings b ON b.id = p."bookingId" WHERE b."flightId" = $1 ORDER BY b.reference`,
      [id],
    );
    expect(refunds).toEqual([paid, withdrawn].sort().map((reference) => ({ reference })));
    expect(
      await db.query(
        `SELECT t.status FROM tickets t JOIN bookings b ON b.id = t."bookingId" WHERE b."flightId" = $1`,
        [id],
      ),
    ).toEqual([{ status: 'VOID' }, { status: 'VOID' }]);
    const [economy] = (await get(`/admin/flights/${id}/load`).expect(200)).body as {
      committedSeats: number;
      activeHeldSeats: number;
    }[];
    expect(economy).toMatchObject({ committedSeats: 0, activeHeldSeats: 0 });
  });

  it('US-AD-04-T03 refuses to cancel a departed flight', async () => {
    const id = await createFlight(new Date(Date.now() + 72 * 3_600_000), 'MS733');
    for (const status of ['BOARDING', 'DEPARTED']) {
      await write('patch', `/admin/flights/${id}/status`).send({ status }).expect(200);
    }
    await write('post', `/admin/flights/${id}/cancel`).send({ reason: 'Maintenance' }).expect(409);
  });

  it('US-AD-06-T01 edits valid airports and refuses to delete referenced airports', async () => {
    const path = '/admin/airports/ZZZ';
    const body = {
      name: 'Demo Airport',
      city: 'Cairo',
      country: 'Egypt',
      timezone: 'Africa/Cairo',
    };
    await write('put', path)
      .send({ ...body, timezone: 'Cairo' })
      .expect(400);
    await write('put', path).send(body).expect(200);
    await write('put', path)
      .send({ ...body, name: 'Edited Airport' })
      .expect(200);
    expect((await get(path).expect(200)).body).toMatchObject({ name: 'Edited Airport' });
    await write('delete', '/admin/airports/CAI').expect(409);
    await write('delete', path).expect(200);
    await get(path).expect(404);
  });

  it('US-AD-06-T05 a timezone change on an airport with departures is a 409 and changes nothing', async () => {
    const cairo = (await get('/admin/airports/CAI').expect(200)).body as Record<string, string>;
    const before = (await get(`/flights/${flightId}`).expect(200)).body as unknown;

    const response = await write('put', '/admin/airports/CAI')
      .send({ name: cairo.name, city: cairo.city, country: cairo.country, timezone: 'Asia/Tokyo' })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'TIMEZONE_IN_USE' });
    expect((await get('/admin/airports/CAI').expect(200)).body).toMatchObject({
      timezone: 'Africa/Cairo',
    });
    expect((await get(`/flights/${flightId}`).expect(200)).body).toEqual(before);
  });

  it('US-AD-07-T01 records actor, target and values, rolls back writes when audit fails, and filters by flight', async () => {
    const response = await get(`/admin/audit?flightId=${flightId}`).expect(200);
    const entries = response.body as { actorId: string; action: string; flightId: string }[];
    expect(entries.every((entry) => entry.flightId === flightId)).toBe(true);
    const principal = (await get('/users/me').expect(200)).body as { id: string };
    expect(entries).toContainEqual(
      expect.objectContaining({
        actorId: principal.id,
        action: 'ConfigureCapacity',
        target: `${flightId}/ECONOMY`,
        before: { capacity: 3 },
        after: { capacity: 2 },
      }),
    );
    expect(entries.filter(({ action }) => action === 'CancelFlight')).toHaveLength(1);
    await db.query(
      `ALTER TABLE audit_log ADD CONSTRAINT reject_test_audit CHECK (action <> 'UpdateFare') NOT VALID`,
    );
    try {
      await write('put', `${flightPath()}/fares/ECONOMY`)
        .send({ amountMinor: 100, currency: 'EGP' })
        .expect(500);
      expect((await get(`/flights/${flightId}`).expect(200)).body).toMatchObject({
        fares: { ECONOMY: { amountMinor: 1_200_000 } },
      });
    } finally {
      await db.query('ALTER TABLE audit_log DROP CONSTRAINT reject_test_audit');
    }
  });

  it('NFR-AUD-01-T01 PostgreSQL refuses audit updates, deletes and truncation', async () => {
    for (const sql of [
      'UPDATE audit_log SET action = action',
      'DELETE FROM audit_log',
      'TRUNCATE audit_log',
    ]) {
      await expect(db.query(sql)).rejects.toThrow('append-only');
    }
  });

  it('US-AD-08-T01 keeps Cairo local departure time across DST and rolls back a series with a duplicate', async () => {
    const path = '/admin/flights/recurring';
    const year = new Date().getUTCFullYear() + 1;
    const template = { ...TEMPLATE, flightNumber: 'MS731' };
    const body = {
      template,
      from: `${year}-04-20`,
      to: `${year}-05-03`,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      localDeparture: '09:00',
      durationMinutes: 300,
    };
    const response = await write('post', path).send(body).expect(201);
    const flights = (response.body as { flights: { id: string }[] }).flights;
    expect(flights).toHaveLength(14);
    const first = (await get(`/flights/${flights[0].id}`).expect(200)).body as {
      scheduledDepartureLocal: string;
    };
    const last = (await get(`/flights/${flights.at(-1)!.id}`).expect(200)).body as {
      scheduledDepartureLocal: string;
    };
    expect(first.scheduledDepartureLocal).toContain('T09:00+02:00');
    expect(last.scheduledDepartureLocal).toContain('T09:00+03:00');
    const failed = await write('post', path)
      .send({ ...body, from: `${year}-04-19`, to: `${year}-04-21` })
      .expect(400);
    expect(failed.body).toMatchObject({
      fieldErrors: {
        [`${year}-04-20`]: 'DUPLICATE_FLIGHT',
        [`${year}-04-21`]: 'DUPLICATE_FLIGHT',
      },
    });
    expect(
      await db.query(
        'SELECT id FROM flights WHERE "flightNumber" = $1 AND "departureLocalDate" = $2',
        ['MS731', `${year}-04-19`],
      ),
    ).toEqual([]);
  });

  it('US-AD-08-T02 accepts a 90-day span and rejects 91 days', async () => {
    const from = new Date(Date.now() + 120 * 86_400_000);
    const date = (extraDays: number) =>
      new Date(from.getTime() + extraDays * 86_400_000).toISOString().slice(0, 10);
    const body = {
      template: { ...TEMPLATE, flightNumber: 'MS734' },
      from: date(0),
      weekdays: [from.getUTCDay() || 7],
      localDeparture: '09:00',
      durationMinutes: 300,
    };
    await write('post', '/admin/flights/recurring')
      .send({ ...body, to: date(91) })
      .expect(400);
    const accepted = await write('post', '/admin/flights/recurring')
      .send({ ...body, to: date(90) })
      .expect(201);
    expect((accepted.body as { flights: unknown[] }).flights).toHaveLength(13);
  });
});
