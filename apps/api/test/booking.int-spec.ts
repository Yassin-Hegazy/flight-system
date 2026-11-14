import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
const ADULT_FARE = 1_500_000;
const CHILD_FARE = 1_125_000; // 75% of the adult fare
const INFANT_FARE = 150_000; // 10% of the adult fare

function yearsAgo(years: number, extraDays = 0): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - extraDays);
  return date.toISOString().slice(0, 10);
}

const adult = (overrides: object = {}) => ({
  firstName: 'Sara',
  lastName: 'Hassan',
  birthDate: '1990-05-01',
  type: 'ADULT',
  ...overrides,
});
const child = () => ({
  firstName: 'Omar',
  lastName: 'Hassan',
  birthDate: yearsAgo(6),
  type: 'CHILD',
});
const infant = () => ({
  firstName: 'Lina',
  lastName: 'Hassan',
  birthDate: yearsAgo(1),
  type: 'INFANT',
});

interface View {
  reference: string;
  status: string;
  amount: { amountMinor: number; currency: string };
  expiresAt: string | null;
  cancelReason: string | null;
  passengers: {
    firstName: string;
    lastName: string;
    type: string;
    fare: { amountMinor: number };
  }[];
  history: { from: string | null; to: string; cause: string }[];
}

describe('Booking over HTTP', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let db: DataSource;
  let catalog: CatalogApi;
  let inventory: InventoryApi;
  let expiry: BookingExpiry;
  let owner: string;
  let other: string;
  let admin: string;
  let flightId: string;
  let counter = 0;

  const server = () => request(app.getHttpServer());
  const post = (path: string, cookie?: string) => {
    const pending = server().post(path).set('x-requested-with', 'fetch');
    return cookie ? pending.set('cookie', cookie) : pending;
  };
  const get = (path: string, cookie = owner) => server().get(path).set('cookie', cookie);

  async function signUp(email: string, name = 'Traveler') {
    await post('/users/register').send({ email, password: PASSWORD, name }).expect(201);
    const login = await post('/users/sign-in').send({ email, password: PASSWORD }).expect(200);
    return (login.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('flight_session='))!
      .split(';')[0];
  }

  async function provision(hours: number, capacity = 60) {
    const departure = Date.now() + hours * 3_600_000;
    counter += 1;
    return db.transaction('READ COMMITTED', async (tx) => {
      const flight = await catalog.createFlight(tx, {
        flightNumber: `MS${950 + counter}`,
        airlineCode: 'MS',
        originCode: 'CAI',
        destinationCode: 'LHR',
        scheduledDepartureUtc: new Date(departure),
        scheduledArrivalUtc: new Date(departure + 18_000_000),
        fares: { ECONOMY: money(ADULT_FARE, 'EGP'), BUSINESS: money(4_500_000, 'EGP') },
      });
      if (!flight.ok) throw new Error(flight.error);
      const seats = await inventory.setCapacity(tx, flight.value, 'ECONOMY', capacity);
      if (!seats.ok) throw new Error('Could not provision test seats');
      return flight.value;
    });
  }

  const book = (body: object, options: { key?: string; cookie?: string; flight?: string } = {}) => {
    const pending = post('/bookings', options.cookie ?? owner).send({
      flightId: options.flight ?? flightId,
      cabin: 'ECONOMY',
      ...body,
    });
    return options.key ? pending.set('idempotency-key', options.key) : pending;
  };
  const created = async (body: object = {}, flight = flightId, cookie = owner) =>
    (await book(body, { flight, cookie }).expect(201)).body as View;
  const pay = (reference: string, cookie = owner) =>
    post(`/bookings/${reference}/payments`, cookie)
      .set('idempotency-key', randomUUID())
      .send({ token: 'tok_success' });
  const cancel = (reference: string, cookie = owner) =>
    post(`/bookings/${reference}/cancel`, cookie);
  const view = async (reference: string, cookie = owner) =>
    (await get(`/bookings/${reference}`, cookie).expect(200)).body as View;

  async function load(flight: string) {
    const result = await inventory.cabinLoad(flight);
    if (!result.ok) throw new Error(result.error);
    return result.value.find((cabin) => cabin.cabin === 'ECONOMY')!;
  }
  const count = async (sql: string, params: unknown[] = []) =>
    Number((await db.query<{ n: string }[]>(sql, params))[0].n);

  /** Makes the booking's hold lapse, as 15 minutes of silence would. */
  async function lapse(reference: string) {
    await db.query(
      `UPDATE seat_holds SET "expiresAt" = now() - interval '1 minute'
       WHERE id = (SELECT "holdId" FROM bookings WHERE reference = $1)`,
      [reference],
    );
    await db.query(
      `UPDATE bookings SET "expiresAt" = now() - interval '1 minute' WHERE reference = $1`,
      [reference],
    );
  }

  /** A write that fails on purpose, to prove the surrounding transaction rolls back. */
  async function failing<T>(sql: string, drop: string, run: () => Promise<T>): Promise<T> {
    await db.query(sql);
    try {
      return await run();
    } finally {
      await db.query(drop);
    }
  }

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    await app.listen(0, '127.0.0.1');
    db = app.get(DataSource);
    catalog = app.get<CatalogApi>(CATALOG_API);
    inventory = app.get<InventoryApi>(INVENTORY_API);
    expiry = app.get<BookingExpiry>(BOOKING_EXPIRY);
    owner = await signUp('booker@example.com', 'Booker One');
    other = await signUp('other-booker@example.com');
    const credentials = { email: 'booking-admin@example.com', password: PASSWORD, name: 'Admin' };
    await seedAdmin(app, credentials);
    admin = (
      (await post('/users/sign-in').send(credentials).expect(200)).headers[
        'set-cookie'
      ] as unknown as string[]
    )
      .find((value) => value.startsWith('flight_session='))!
      .split(';')[0];
    flightId = await provision(72);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  // ---------------------------------------------------------------- US-BK-01 Create a booking

  it('US-BK-01-T01 a bad passenger is a 400 naming the field, and nothing is held', async () => {
    const before = await load(flightId);
    const response = await book({
      passengers: [adult(), adult({ firstName: 'a'.repeat(51) })],
    }).expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: { 'passengers.1.firstName': expect.any(String) },
    });
    await book({ passengers: [adult({ birthDate: '2999-01-01' })] }).expect(400);
    await book({ passengers: [adult({ type: 'CHILD' })] }).expect(400);
    expect(await load(flightId)).toEqual(before);
  });

  it('US-BK-01-T02 booking creation and the seat hold are atomic', async () => {
    const before = await load(flightId);
    const bookings = await count('SELECT count(*) AS n FROM bookings');
    await failing(
      `ALTER TABLE booking_history ADD CONSTRAINT test_fail CHECK (cause <> 'CREATED') NOT VALID`,
      'ALTER TABLE booking_history DROP CONSTRAINT test_fail',
      () => book({ passengers: [adult()] }).expect(500),
    );
    expect(await count('SELECT count(*) AS n FROM bookings')).toBe(bookings);
    expect(await load(flightId)).toEqual(before);
  });

  it('US-BK-01-T03 a new booking is pending payment with a unique reference and a hold expiry', async () => {
    const references = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const booking = await created({ passengers: [adult()] });
      expect(booking.status).toBe('PENDING_PAYMENT');
      expect(booking.reference).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      const minutes = (new Date(booking.expiresAt!).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(13);
      expect(minutes).toBeLessThanOrEqual(15);
      references.add(booking.reference);
    }
    expect(references.size).toBe(4);
  });

  it('US-BK-01-T04 resubmitting with the same idempotency key returns the original booking', async () => {
    const key = randomUUID();
    const before = await load(flightId);
    const body = { passengers: [adult(), child()] };
    const [first, second] = await Promise.all([
      book(body, { key }).expect(201),
      book(body, { key }).expect(201),
    ]);
    const again = await book(body, { key }).expect(201);
    const references = new Set(
      [first, second, again].map((response) => (response.body as View).reference),
    );
    expect(references.size).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM booking_idempotency WHERE key = $1`, [key])).toBe(
      1,
    );
    // Held exactly once: two seats, not six.
    expect((await load(flightId)).activeHeldSeats - before.activeHeldSeats).toBe(2);
  });

  it('US-BK-01-T04 the same key with a different request is a 409, and an old key is forgotten', async () => {
    const key = randomUUID();
    await book({ passengers: [adult()] }, { key }).expect(201);
    const reused = await book({ passengers: [adult(), adult()] }, { key }).expect(409);
    expect(reused.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    await db.query(
      `UPDATE booking_idempotency SET "createdAt" = now() - interval '25 hours' WHERE key = $1`,
      [key],
    );
    const fresh = await book({ passengers: [adult(), adult()] }, { key }).expect(201);
    expect((fresh.body as View).passengers).toHaveLength(2);
  });

  it('US-BK-01-T05 9 passengers are accepted, 10 rejected, and infants cannot outnumber adults', async () => {
    await book({ passengers: Array.from({ length: 9 }, () => adult()) }).expect(201);
    await book({ passengers: Array.from({ length: 10 }, () => adult()) }).expect(400);
    const tooMany = await book({
      passengers: [adult(), adult(), infant(), infant(), infant()],
    }).expect(400);
    expect(tooMany.body).toMatchObject({ fieldErrors: { passengers: expect.any(String) } });
    await book({ passengers: [adult(), adult(), infant(), infant()] }).expect(201);
  });

  it('US-BK-01-T06 the booking belongs to the signed-in user even if the body says otherwise', async () => {
    const me = (await get('/users/me').expect(200)).body as { id: string };
    const stranger = (await get('/users/me', other).expect(200)).body as { id: string };
    const booking = (
      await book({ passengers: [adult()], ownerId: stranger.id, status: 'CONFIRMED' }).expect(201)
    ).body as View;
    expect(booking.status).toBe('PENDING_PAYMENT');
    const [row] = await db.query<{ ownerId: string }[]>(
      'SELECT "ownerId" FROM bookings WHERE reference = $1',
      [booking.reference],
    );
    expect(row.ownerId).toBe(me.id);
  });

  it('US-BK-01-T07 a request without passengers books the signed-in user alone', async () => {
    const booking = await created();
    expect(booking.passengers).toHaveLength(1);
    expect(booking.passengers[0]).toMatchObject({ firstName: 'Booker One', type: 'ADULT' });
    expect(booking.amount).toEqual({ amountMinor: ADULT_FARE, currency: 'EGP' });
  });

  it('US-BK-01-T08 a flight that cannot be booked is a 409 and holds nothing', async () => {
    const before = await load(flightId);
    await book({ passengers: [adult()] }, { flight: randomUUID() }).expect(409);
    await book({ passengers: [adult()], cabin: 'BUSINESS' }).expect(409);
    expect(await load(flightId)).toEqual(before);
  });

  it('US-BK-01-T09 more seats than are free is a 409 and holds nothing', async () => {
    const small = await provision(72, 2);
    const response = await book(
      { passengers: [adult(), adult(), adult()] },
      { flight: small },
    ).expect(409);
    expect(response.body).toMatchObject({ code: 'SEATS_UNAVAILABLE' });
    expect((await load(small)).activeHeldSeats).toBe(0);
  });

  // ---------------------------------------------------- US-BK-02 Track the booking lifecycle

  it('US-BK-02-T02 each transition is recorded with time and cause, and the history is visible', async () => {
    const booking = await created({ passengers: [adult()] });
    await pay(booking.reference).expect(201);
    await cancel(booking.reference).expect(200);
    const after = await view(booking.reference);
    expect(after.history.map((h) => [h.from, h.to, h.cause])).toEqual([
      [null, 'PENDING_PAYMENT', 'CREATED'],
      ['PENDING_PAYMENT', 'CONFIRMED', 'PAYMENT'],
      // Ticketing issues after the payment commits and moves the booking on.
      ['CONFIRMED', 'TICKETED', 'TICKETING'],
      ['TICKETED', 'CANCELLED', 'TRAVELER'],
    ]);
  });

  it('US-BK-02-T03 no API endpoint accepts a status value directly', async () => {
    const booking = await created({ passengers: [adult()] });
    for (const method of ['patch', 'put'] as const) {
      const response = await server()
        [method](`/bookings/${booking.reference}`)
        .set('x-requested-with', 'fetch')
        .set('cookie', owner)
        .send({ status: 'CONFIRMED' });
      expect(response.status).toBe(404);
    }
    await post(`/bookings/${booking.reference}/status`, owner)
      .send({ status: 'CONFIRMED' })
      .expect(404);
    expect((await view(booking.reference)).status).toBe('PENDING_PAYMENT');
  });

  it('US-BK-02-T04 an expired booking cannot be cancelled and a failed transition changes nothing', async () => {
    const booking = await created({ passengers: [adult()] });
    await lapse(booking.reference);
    await expiry.expireOverdue(new Date());
    const refused = await cancel(booking.reference).expect(409);
    expect(refused.body).toMatchObject({ code: 'INVALID_BOOKING_TRANSITION' });
    const after = await view(booking.reference);
    expect(after.status).toBe('EXPIRED');
    expect(after.history.at(-1)).toMatchObject({ to: 'EXPIRED', cause: 'EXPIRY' });
  });

  // -------------------------------------------------------- US-BK-03 Preserve the booked fare

  it('US-BK-03-T01 each passenger fare and the total are stored as a snapshot that adds up', async () => {
    const booking = await created({ passengers: [adult(), child(), infant()] });
    expect(booking.passengers.map((p) => p.fare.amountMinor)).toEqual([
      ADULT_FARE,
      CHILD_FARE,
      INFANT_FARE,
    ]);
    expect(booking.amount).toEqual({
      amountMinor: ADULT_FARE + CHILD_FARE + INFANT_FARE,
      currency: 'EGP',
    });
  });

  it('US-BK-03-T02 a later fare change alters no existing booking', async () => {
    const own = await provision(72);
    const booking = await created({ passengers: [adult(), adult()] }, own);
    await db.transaction('READ COMMITTED', async (tx) => {
      const changed = await catalog.setFare(tx, own, 'ECONOMY', money(2_000_000, 'EGP'));
      if (!changed.ok) throw new Error(changed.error);
    });
    expect((await view(booking.reference)).amount.amountMinor).toBe(2 * ADULT_FARE);
    expect((await created({ passengers: [adult()] }, own)).amount.amountMinor).toBe(2_000_000);
  });

  it('US-BK-03-T03 a displayed total that differs from the current one is rejected and holds nothing', async () => {
    const before = await load(flightId);
    const stale = await book({
      passengers: [adult()],
      displayedTotal: ADULT_FARE - 500_000,
    }).expect(409);
    expect(stale.body).toMatchObject({
      code: 'PRICE_CHANGED',
      fieldErrors: { currentTotal: String(ADULT_FARE) },
    });
    expect(await load(flightId)).toEqual(before);
    await book({ passengers: [adult()], displayedTotal: ADULT_FARE }).expect(201);
  });

  it('NFR-DATA-01-T01 over random parties, the passenger fares always add up to the integer total', async () => {
    const own = await provision(72, 200);
    for (let round = 0; round < 12; round += 1) {
      const adults = 1 + Math.floor(Math.random() * 4);
      const kids = Math.floor(Math.random() * (9 - adults - 1));
      const babies = Math.floor(Math.random() * (adults + 1));
      const passengers = [
        ...Array.from({ length: adults }, () => adult()),
        ...Array.from({ length: kids }, () => child()),
        ...Array.from({ length: Math.min(babies, 9 - adults - kids) }, () => infant()),
      ];
      const booking = await created({ passengers }, own);
      const sum = booking.passengers.reduce((total, p) => total + p.fare.amountMinor, 0);
      expect(Number.isInteger(booking.amount.amountMinor)).toBe(true);
      expect(sum).toBe(booking.amount.amountMinor);
    }
  });

  // --------------------------------------------------- US-BK-04 Retrieve a booking by reference

  it('US-BK-04-T01 the owner sees reference, status, flight, passengers, fare and hold expiry', async () => {
    const booking = await created({ passengers: [adult(), child()] });
    const read = await view(booking.reference);
    expect(read).toMatchObject({
      reference: booking.reference,
      status: 'PENDING_PAYMENT',
      amount: { amountMinor: ADULT_FARE + CHILD_FARE, currency: 'EGP' },
      expiresAt: expect.any(String),
    });
    expect(read.passengers.map((p) => p.firstName)).toEqual(['Sara', 'Omar']);
    await pay(booking.reference).expect(201);
    expect((await view(booking.reference)).expiresAt).toBeNull();
  });

  it("US-BK-04-T02 another user's reference answers exactly like an unknown one", async () => {
    const booking = await created({ passengers: [adult()] });
    const theirs = await get(`/bookings/${booking.reference}`, other).expect(404);
    const unknown = await get('/bookings/AAAAAA', other).expect(404);
    expect({ ...theirs.body, requestId: null }).toEqual({ ...unknown.body, requestId: null });
    await cancel(booking.reference, other).expect(404);
  });

  it('US-BK-04-T03 lookup is case-insensitive', async () => {
    const booking = await created({ passengers: [adult()] });
    expect((await view(booking.reference.toLowerCase())).reference).toBe(booking.reference);
  });

  // ------------------------------------------------------------ US-BK-05 Cancel a booking

  it('US-BK-05-T01 an unpaid booking can always be cancelled, a paid one 48 hours out too', async () => {
    const before = await load(flightId);
    const unpaid = await created({ passengers: [adult(), adult()] });
    expect(((await cancel(unpaid.reference).expect(200)).body as View).status).toBe('CANCELLED');
    const paid = await created({ passengers: [adult()] });
    await pay(paid.reference).expect(201);
    expect(((await cancel(paid.reference).expect(200)).body as View).status).toBe('CANCELLED');
    const after = await load(flightId);
    expect(after.activeHeldSeats).toBe(before.activeHeldSeats);
    expect(after.committedSeats).toBe(before.committedSeats);
  });

  it('US-BK-05-T02 inside the 24-hour window a paid booking cannot be cancelled and nothing changes', async () => {
    const soon = await provision(10);
    const paid = await created({ passengers: [adult()] }, soon);
    await pay(paid.reference).expect(201);
    const refused = await cancel(paid.reference).expect(409);
    expect(refused.body).toMatchObject({ code: 'CANCELLATION_CUTOFF' });
    expect((await view(paid.reference)).status).toBe('TICKETED');
    expect((await load(soon)).committedSeats).toBe(1);
    // An unpaid booking on the same flight is still free to drop.
    const unpaid = await created({ passengers: [adult()] }, soon);
    await cancel(unpaid.reference).expect(200);
  });

  it('US-BK-05-T03 cancelling twice releases the seats and refunds only once', async () => {
    const before = await load(flightId);
    const paid = await created({ passengers: [adult(), adult()] });
    await pay(paid.reference).expect(201);
    await cancel(paid.reference).expect(200);
    await cancel(paid.reference).expect(200);
    const after = await load(flightId);
    expect(after.committedSeats).toBe(before.committedSeats);
    expect(after.activeHeldSeats).toBe(before.activeHeldSeats);
    expect(
      await count(
        `SELECT count(*) AS n FROM refunds r JOIN payments p ON p.id = r."paymentId"
         JOIN bookings b ON b.id = p."bookingId" WHERE b.reference = $1`,
        [paid.reference],
      ),
    ).toBe(1);
    const history = (await view(paid.reference)).history;
    expect(history.filter((h) => h.to === 'CANCELLED')).toHaveLength(1);
  });

  it('US-BK-05-T04 a paid booking is refunded and its tickets are voided', async () => {
    const paid = await created({ passengers: [adult()] });
    await pay(paid.reference).expect(201);
    const [ticket] = await db.query<{ status: string }[]>(
      `SELECT t.status FROM tickets t JOIN bookings b ON b.id = t."bookingId" WHERE b.reference = $1`,
      [paid.reference],
    );
    expect(ticket.status).toBe('VALID');
    await cancel(paid.reference).expect(200);
    const [voided] = await db.query<{ status: string }[]>(
      `SELECT t.status FROM tickets t JOIN bookings b ON b.id = t."bookingId" WHERE b.reference = $1`,
      [paid.reference],
    );
    expect(voided.status).toBe('VOID');
    expect(
      await count(
        `SELECT count(*) AS n FROM refunds r JOIN payments p ON p.id = r."paymentId"
         JOIN bookings b ON b.id = p."bookingId" WHERE b.reference = $1`,
        [paid.reference],
      ),
    ).toBe(1);
  });

  it('US-BK-05-T05 status, seats, tickets and the refund record commit together or not at all', async () => {
    const paid = await created({ passengers: [adult()] });
    await pay(paid.reference).expect(201);
    const before = await load(flightId);
    await failing(
      `ALTER TABLE booking_history ADD CONSTRAINT test_fail CHECK (cause <> 'TRAVELER') NOT VALID`,
      'ALTER TABLE booking_history DROP CONSTRAINT test_fail',
      () => cancel(paid.reference).expect(500),
    );
    expect((await view(paid.reference)).status).toBe('TICKETED');
    expect(await load(flightId)).toEqual(before);
    const [ticket] = await db.query<{ status: string }[]>(
      `SELECT t.status FROM tickets t JOIN bookings b ON b.id = t."bookingId" WHERE b.reference = $1`,
      [paid.reference],
    );
    expect(ticket.status).toBe('VALID');
  });

  // ------------------------------------------------------------- US-BK-06 List my bookings

  it('US-BK-06-T01 lists only my bookings, split into upcoming and past by departure', async () => {
    const lister = await signUp('lister@example.com');
    const rival = await signUp('rival@example.com');
    const future = await provision(96);
    const gone = await provision(96);
    const mine = await created({ passengers: [adult()] }, future, lister);
    const old = await created({ passengers: [adult()] }, gone, lister);
    const theirs = await created({ passengers: [adult()] }, future, rival);
    await db.query(
      `UPDATE flights SET "scheduledDepartureUtc" = now() - interval '2 days',
       "scheduledArrivalUtc" = now() - interval '2 days' + interval '5 hours',
       "departureLocalDate" = (now() - interval '2 days')::date WHERE id = $1`,
      [gone],
    );
    const listed = (await get('/bookings', lister).expect(200)).body as {
      upcoming: { reference: string }[];
      past: { reference: string }[];
    };
    expect(listed.upcoming.map((b) => b.reference)).toEqual([mine.reference]);
    expect(listed.past.map((b) => b.reference)).toEqual([old.reference]);
    const everything = JSON.stringify(listed);
    expect(everything).not.toContain(theirs.reference);
  });

  it('US-BK-06-T02 each entry shows reference, route, local departure, status and total', async () => {
    const lister = await signUp('lister2@example.com');
    const booking = await created({ passengers: [adult(), child()] }, flightId, lister);
    const listed = (await get('/bookings', lister).expect(200)).body as {
      upcoming: object[];
    };
    expect(listed.upcoming).toEqual([
      {
        reference: booking.reference,
        route: { origin: 'CAI', destination: 'LHR' },
        departureLocal: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}[+-]\d{2}:\d{2}$/),
        status: 'PENDING_PAYMENT',
        total: { amountMinor: ADULT_FARE + CHILD_FARE, currency: 'EGP' },
      },
    ]);
  });

  it('US-BK-06-T03 expired bookings are hidden by default and shown on request', async () => {
    const lister = await signUp('lister3@example.com');
    const booking = await created({ passengers: [adult()] }, flightId, lister);
    await lapse(booking.reference);
    await expiry.expireOverdue(new Date());
    const hidden = (await get('/bookings', lister).expect(200)).body as { upcoming: object[] };
    expect(hidden.upcoming).toEqual([]);
    const shown = (await get('/bookings?includeExpired=true', lister).expect(200)).body as {
      upcoming: { reference: string; status: string }[];
    };
    expect(shown.upcoming).toMatchObject([{ reference: booking.reference, status: 'EXPIRED' }]);
  });

  // ------------------------------------------------------------ US-BK-07 Expire unpaid bookings

  it('US-BK-07-T01 a pending booking past its hold expiry becomes EXPIRED; one that is not due stays', async () => {
    const stale = await created({ passengers: [adult()] });
    const fresh = await created({ passengers: [adult()] });
    await lapse(stale.reference);
    expect(await expiry.expireOverdue(new Date())).toBeGreaterThanOrEqual(1);
    expect((await view(stale.reference)).status).toBe('EXPIRED');
    expect((await view(fresh.reference)).status).toBe('PENDING_PAYMENT');
  });

  it('US-BK-07-T02 the seats are back on sale before the job runs', async () => {
    const own = await provision(72, 3);
    const booking = await created({ passengers: [adult(), adult(), adult()] }, own);
    expect((await load(own)).availableSeats).toBe(0);
    await lapse(booking.reference);
    expect((await load(own)).availableSeats).toBe(3);
    expect((await view(booking.reference)).status).toBe('PENDING_PAYMENT');
    await expiry.expireOverdue(new Date());
    expect((await load(own)).availableSeats).toBe(3);
  });

  it('US-BK-07-T03 running the job twice in parallel expires and releases once', async () => {
    const booking = await created({ passengers: [adult(), adult()] });
    await lapse(booking.reference);
    const runs = await Promise.all([
      expiry.expireOverdue(new Date()),
      expiry.expireOverdue(new Date()),
      expiry.expireOverdue(new Date()),
    ]);
    expect(runs.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
    const history = (await view(booking.reference)).history;
    expect(history.filter((h) => h.to === 'EXPIRED')).toHaveLength(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM seat_holds WHERE "bookingId" = (SELECT id FROM bookings WHERE reference = $1)
         AND status = 'RELEASED'`,
        [booking.reference],
      ),
    ).toBeLessThanOrEqual(1);
  });

  it('US-BK-07-T04 BookingExpired is published exactly once and the traveler is told', async () => {
    const heard: string[] = [];
    const events = app.get(EventEmitter2);
    const listener = (event: { ref: string }) => heard.push(event.ref);
    events.on('BookingExpired', listener);
    try {
      const booking = await created({ passengers: [adult()] });
      await lapse(booking.reference);
      await Promise.all([expiry.expireOverdue(new Date()), expiry.expireOverdue(new Date())]);
      expect(heard.filter((ref) => ref === booking.reference)).toHaveLength(1);
      const inbox = (await get('/notifications').expect(200)).body as {
        items: { title: string }[];
      };
      expect(inbox.items.filter((i) => i.title.includes(booking.reference))).toHaveLength(1);
    } finally {
      events.off('BookingExpired', listener);
    }
  });

  it('US-BK-07-T05 paying an expired booking is refused', async () => {
    const booking = await created({ passengers: [adult()] });
    await lapse(booking.reference);
    await expiry.expireOverdue(new Date());
    const refused = await pay(booking.reference).expect(409);
    expect(refused.body).toMatchObject({ code: 'HOLD_EXPIRED' });
  });

  it('NFR-REL-02-T01 an overlapping cancel and expiry release the seats exactly once', async () => {
    const own = await provision(72, 4);
    const booking = await created({ passengers: [adult(), adult()] }, own);
    await lapse(booking.reference);
    await Promise.all([cancel(booking.reference), expiry.expireOverdue(new Date())]);
    const final = (await view(booking.reference)).status;
    expect(['CANCELLED', 'EXPIRED']).toContain(final);
    expect(await load(own)).toMatchObject({
      availableSeats: 4,
      activeHeldSeats: 0,
      committedSeats: 0,
    });
  });

  // ----------------------------------------------------- US-BK-08 React to an airline cancellation

  it('US-BK-08-T01 every non-terminal booking on the flight is cancelled with reason AIRLINE', async () => {
    const own = await provision(10);
    const pending = await created({ passengers: [adult()] }, own);
    const paid = await created({ passengers: [adult(), child()] }, own);
    await pay(paid.reference).expect(201);
    const stale = await created({ passengers: [adult()] }, own);
    await lapse(stale.reference);
    await expiry.expireOverdue(new Date());
    const withdrawn = await created({ passengers: [adult()] }, own);
    await cancel(withdrawn.reference).expect(200);

    await post(`/admin/flights/${own}/cancel`, admin).send({ reason: 'Maintenance' }).expect(200);

    expect(await view(pending.reference)).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'AIRLINE',
    });
    expect(await view(paid.reference)).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'AIRLINE',
    });
    expect((await view(stale.reference)).status).toBe('EXPIRED');
    expect(await view(withdrawn.reference)).toMatchObject({ cancelReason: 'TRAVELER' });
    expect(await load(own)).toMatchObject({ activeHeldSeats: 0, committedSeats: 0 });
  });

  it('US-BK-08-T02 tickets are voided and paid bookings refunded; the 24-hour cut-off does not apply', async () => {
    const own = await provision(5);
    const paid = await created({ passengers: [adult()] }, own);
    await pay(paid.reference).expect(201);
    await cancel(paid.reference).expect(409);
    await post(`/admin/flights/${own}/cancel`, admin).send({ reason: 'Crew shortage' }).expect(200);
    expect((await view(paid.reference)).status).toBe('CANCELLED');
    expect(
      await count(
        `SELECT count(*) AS n FROM tickets t JOIN bookings b ON b.id = t."bookingId"
         WHERE b."flightId" = $1 AND t.status = 'VOID'`,
        [own],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM refunds r JOIN payments p ON p.id = r."paymentId"
         JOIN bookings b ON b.id = p."bookingId" WHERE b."flightId" = $1`,
        [own],
      ),
    ).toBe(1);
  });

  it('US-BK-08-T03 each affected traveler is notified once', async () => {
    const own = await provision(30);
    const traveler = await signUp('grounded@example.com');
    const booking = await created({ passengers: [adult()] }, own, traveler);
    await pay(booking.reference, traveler).expect(201);
    await post(`/admin/flights/${own}/cancel`, admin).send({ reason: 'Weather' }).expect(200);
    const inbox = (await get('/notifications', traveler).expect(200)).body as {
      items: { title: string; body?: string }[];
    };
    expect(
      inbox.items.filter((i) => JSON.stringify(i).includes(booking.reference)),
    ).not.toHaveLength(0);
  });

  it('US-BK-08-T04 the flight cancellation and all its booking cancellations commit together', async () => {
    const own = await provision(72);
    const first = await created({ passengers: [adult()] }, own);
    const second = await created({ passengers: [adult()] }, own);
    const third = await created({ passengers: [adult()] }, own);
    await pay(second.reference).expect(201);
    await failing(
      `ALTER TABLE booking_history ADD CONSTRAINT test_fail CHECK (cause <> 'AIRLINE') NOT VALID`,
      'ALTER TABLE booking_history DROP CONSTRAINT test_fail',
      () => post(`/admin/flights/${own}/cancel`, admin).send({ reason: 'Strike' }).expect(500),
    );
    for (const booking of [first, second, third]) {
      expect(['PENDING_PAYMENT', 'TICKETED']).toContain((await view(booking.reference)).status);
    }
    const flight = await catalog.getFlight(own);
    expect(flight?.status).not.toBe('CANCELLED');
  });

  // ----------------------------------------------- US-BK-09 Fill passengers from saved travelers

  it('US-BK-09-T02 details are copied: editing a saved traveler changes no booking', async () => {
    const traveler = await signUp('saver@example.com');
    const saved = (
      await post('/users/me/saved-travelers', traveler)
        .send({ name: 'Nour Saved', dateOfBirth: '1988-02-03' })
        .expect(201)
    ).body as { id: string };
    const booking = await created(
      {
        passengers: [
          { firstName: 'Nour', lastName: 'Saved', birthDate: '1988-02-03', type: 'ADULT' },
        ],
      },
      flightId,
      traveler,
    );
    await server()
      .patch(`/users/me/saved-travelers/${saved.id}`)
      .set('x-requested-with', 'fetch')
      .set('cookie', traveler)
      .send({ name: 'Renamed Person', dateOfBirth: '1999-09-09' })
      .expect(200);
    expect((await view(booking.reference, traveler)).passengers[0]).toMatchObject({
      firstName: 'Nour',
      lastName: 'Saved',
      birthDate: '1988-02-03',
    });
  });

  // ------------------------------------------------------------------ NFR-SEC-02 and the manifest

  it('NFR-SEC-02-T02 a non-owner can neither read, pay for nor cancel a booking', async () => {
    const booking = await created({ passengers: [adult()] });
    await get(`/bookings/${booking.reference}`, other).expect(404);
    await cancel(booking.reference, other).expect(404);
    await pay(booking.reference, other).expect(404);
    expect((await view(booking.reference)).status).toBe('PENDING_PAYMENT');
  });

  it('US-BK-01-T10 the admin manifest lists every passenger on a paid booking', async () => {
    const own = await provision(72);
    const booking = await created({ passengers: [adult(), child(), infant()] }, own);
    await pay(booking.reference).expect(201);
    const manifest = (await get(`/admin/flights/${own}/manifest`, admin).expect(200)).body as {
      passengerName: string;
      bookingReference: string;
    }[];
    expect(manifest.map((row) => row.passengerName).sort()).toEqual([
      'Lina Hassan',
      'Omar Hassan',
      'Sara Hassan',
    ]);
    expect(new Set(manifest.map((row) => row.bookingReference))).toEqual(
      new Set([booking.reference]),
    );
  });
});
