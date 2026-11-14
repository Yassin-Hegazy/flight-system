import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAdmin } from '../src/database/seed-admin';
import { BOOKING_EXPIRY, type BookingExpiry } from '../src/modules/booking/index';
import { CATALOG_API, type CatalogApi } from '../src/modules/flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../src/modules/inventory/index';
import { money } from '../src/shared/money';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'correct horse battery';
const OUT_FARE = 1_500_000;
const BACK_FARE = 1_300_000;

const adult = (firstName: string) => ({
  firstName,
  lastName: 'Adel',
  birthDate: '1990-05-01',
  type: 'ADULT',
});

interface View {
  reference: string;
  status: string;
  amount: { amountMinor: number };
  segments: { flightId: string; cabin: string }[];
  passengers: { fare: { amountMinor: number } }[];
}

/** US-FS-06 AC-3: a round trip is one booking with two segments (Search pack, Booking module). */
describe('Round-trip booking', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let db: DataSource;
  let inventory: InventoryApi;
  let owner: string;
  let admin: string;
  let counter = 0;

  const server = () => request(app.getHttpServer());
  const post = (path: string, cookie = owner) =>
    server().post(path).set('x-requested-with', 'fetch').set('cookie', cookie);
  const get = (path: string, cookie = owner) => server().get(path).set('cookie', cookie);

  async function signIn(email: string, register = true) {
    if (register) {
      await post('/users/register', '')
        .send({ email, password: PASSWORD, name: 'Mona Adel' })
        .expect(201);
    }
    const login = await post('/users/sign-in', '').send({ email, password: PASSWORD }).expect(200);
    return (login.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('flight_session='))!
      .split(';')[0];
  }

  /** A flight `hours` from now on the given route, with `seats` Economy seats. */
  async function flight(
    origin: string,
    destination: string,
    hours: number,
    fare: number,
    seats = 20,
  ) {
    counter += 1;
    const departure = Date.now() + hours * 3_600_000;
    return db.transaction('READ COMMITTED', async (tx) => {
      const created = await app.get<CatalogApi>(CATALOG_API).createFlight(tx, {
        flightNumber: `MS${1200 + counter}`,
        airlineCode: 'MS',
        originCode: origin,
        destinationCode: destination,
        scheduledDepartureUtc: new Date(departure),
        scheduledArrivalUtc: new Date(departure + 18_000_000),
        fares: { ECONOMY: money(fare, 'EGP'), BUSINESS: money(fare * 3, 'EGP') },
      });
      if (!created.ok) throw new Error(created.error);
      await inventory.setCapacity(tx, created.value, 'ECONOMY', seats);
      return created.value;
    });
  }

  const pair = async (seatsBack = 20) => ({
    out: await flight('CAI', 'LHR', 72, OUT_FARE),
    back: await flight('LHR', 'CAI', 144, BACK_FARE, seatsBack),
  });

  const book = (out: string, back: string, passengers = [adult('Mona'), adult('Karim')]) =>
    post('/bookings').send({ flightId: out, returnFlightId: back, cabin: 'ECONOMY', passengers });

  const pay = (reference: string) =>
    post(`/bookings/${reference}/payments`)
      .set('idempotency-key', randomUUID())
      .send({ token: 'tok_success' })
      .expect(201);

  async function load(id: string) {
    const result = await inventory.cabinLoad(id);
    if (!result.ok) throw new Error(result.error);
    return result.value.find((cabin) => cabin.cabin === 'ECONOMY')!;
  }

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    await app.listen(0, '127.0.0.1');
    db = app.get(DataSource);
    inventory = app.get<InventoryApi>(INVENTORY_API);
    owner = await signIn('round-trip@example.com');
    await seedAdmin(app, {
      email: 'round-trip-admin@example.com',
      password: PASSWORD,
      name: 'Admin',
    });
    admin = await signIn('round-trip-admin@example.com', false);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('US-FS-06-T03 a round trip is one booking with two segments, both legs held together', async () => {
    const { out, back } = await pair();

    const booking = (await book(out, back).expect(201)).body as View;

    expect(booking.segments).toEqual([
      { flightId: out, cabin: 'ECONOMY' },
      { flightId: back, cabin: 'ECONOMY' },
    ]);
    expect(booking.amount.amountMinor).toBe(2 * (OUT_FARE + BACK_FARE));
    expect(booking.passengers.map(({ fare }) => fare.amountMinor)).toEqual([
      OUT_FARE + BACK_FARE,
      OUT_FARE + BACK_FARE,
    ]);
    expect((await load(out)).activeHeldSeats).toBe(2);
    expect((await load(back)).activeHeldSeats).toBe(2);
  });

  it('US-FS-06-T09 two opposite round trips booked at the same moment both finish', async () => {
    const out = await flight('CAI', 'LHR', 72, OUT_FARE);
    const back = await flight('LHR', 'CAI', 144, BACK_FARE);
    // Each locks the two flights in ascending ID order, so neither waits on the other forever.
    const reverseOut = await flight('LHR', 'CAI', 72, BACK_FARE);
    const reverseBack = await flight('CAI', 'LHR', 144, OUT_FARE);

    const results = await Promise.all([
      book(out, back),
      book(reverseOut, reverseBack),
      book(out, back),
      book(reverseOut, reverseBack),
    ]);

    expect(results.map(({ status }) => status)).toEqual([201, 201, 201, 201]);
  });

  it('US-FS-06-T10 when the return has no seats, the outbound holds nothing either', async () => {
    const { out, back } = await pair(1);

    const refused = await book(out, back).expect(409);

    expect(refused.body).toMatchObject({ code: 'SEATS_UNAVAILABLE' });
    expect((await load(out)).activeHeldSeats).toBe(0);
    expect((await load(back)).activeHeldSeats).toBe(0);
  });

  it('US-FS-06-T11 the return must fly the reverse route and leave after the outbound', async () => {
    const out = await flight('CAI', 'LHR', 72, OUT_FARE);
    const sameDirection = await flight('CAI', 'LHR', 144, OUT_FARE);
    const tooEarly = await flight('LHR', 'CAI', 48, BACK_FARE);

    for (const back of [sameDirection, tooEarly, out]) {
      const refused = await book(out, back).expect(400);
      expect(refused.body).toMatchObject({ fieldErrors: { returnFlightId: expect.any(String) } });
    }
    expect((await load(out)).activeHeldSeats).toBe(0);
  });

  it('US-FS-06-T12 paying commits both legs and issues one ticket per passenger per leg at its fare', async () => {
    const { out, back } = await pair();
    const { reference } = (await book(out, back).expect(201)).body as View;

    await pay(reference);

    expect((await load(out)).committedSeats).toBe(2);
    expect((await load(back)).committedSeats).toBe(2);
    const tickets = (await get(`/bookings/${reference}/tickets`).expect(200)).body as {
      flight: { flightNumber: string };
      passengerName: string;
    }[];
    expect(tickets).toHaveLength(4);
    const fares = await db.query<{ flightId: string; fareMinor: number }[]>(
      `SELECT t."flightId", t."fareMinor" FROM tickets t JOIN bookings b ON b.id = t."bookingId"
       WHERE b.reference = $1 ORDER BY t.number`,
      [reference],
    );
    expect(
      fares.filter(({ flightId }) => flightId === out).map(({ fareMinor }) => fareMinor),
    ).toEqual([OUT_FARE, OUT_FARE]);
    expect(
      fares.filter(({ flightId }) => flightId === back).map(({ fareMinor }) => fareMinor),
    ).toEqual([BACK_FARE, BACK_FARE]);
    const manifest = (await get(`/admin/flights/${back}/manifest`, admin).expect(200)).body as {
      bookingReference: string;
      ticketNumber: string | null;
    }[];
    expect(manifest.filter(({ bookingReference }) => bookingReference === reference)).toHaveLength(
      2,
    );
    expect(manifest.every(({ ticketNumber }) => ticketNumber !== null)).toBe(true);
  });

  it('US-FS-06-T13 cancelling releases both legs and voids every ticket', async () => {
    const { out, back } = await pair();
    const { reference } = (await book(out, back).expect(201)).body as View;
    await pay(reference);

    await post(`/bookings/${reference}/cancel`).expect(200);

    expect((await load(out)).committedSeats).toBe(0);
    expect((await load(back)).committedSeats).toBe(0);
    const statuses = await db.query<{ status: string }[]>(
      `SELECT DISTINCT t.status FROM tickets t JOIN bookings b ON b.id = t."bookingId" WHERE b.reference = $1`,
      [reference],
    );
    expect(statuses).toEqual([{ status: 'VOID' }]);
  });

  it('US-FS-06-T14 an unpaid round trip that expires gives both legs back', async () => {
    const { out, back } = await pair();
    const { reference } = (await book(out, back).expect(201)).body as View;
    await db.query(
      `UPDATE seat_holds SET "expiresAt" = now() - interval '1 minute'
       WHERE "bookingId" = (SELECT id FROM bookings WHERE reference = $1)`,
      [reference],
    );
    await db.query(
      `UPDATE bookings SET "expiresAt" = now() - interval '1 minute' WHERE reference = $1`,
      [reference],
    );

    await app.get<BookingExpiry>(BOOKING_EXPIRY).expireOverdue(new Date());

    expect(((await get(`/bookings/${reference}`).expect(200)).body as View).status).toBe('EXPIRED');
    expect((await load(out)).activeHeldSeats).toBe(0);
    expect((await load(back)).activeHeldSeats).toBe(0);
  });

  it('US-FS-06-T15 an airline cancelling the return leg cancels and refunds the whole trip', async () => {
    const { out, back } = await pair();
    const { reference } = (await book(out, back).expect(201)).body as View;
    await pay(reference);

    await post(`/admin/flights/${back}/cancel`, admin).send({ reason: 'Strike' }).expect(200);

    const booking = (await get(`/bookings/${reference}`).expect(200)).body as View;
    expect(booking.status).toBe('CANCELLED');
    expect((await load(out)).committedSeats).toBe(0);
    expect((await get(`/bookings/${reference}/receipt`).expect(200)).body).toMatchObject({
      refund: { amount: { amountMinor: 2 * (OUT_FARE + BACK_FARE) } },
    });
  });
});
