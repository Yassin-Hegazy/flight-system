import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAdmin } from '../src/database/seed-admin';
import { CATALOG_API, type CatalogApi } from '../src/modules/flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../src/modules/inventory/index';
import { IssueTickets, TicketRepairJob } from '../src/modules/ticketing/index';
import { money } from '../src/shared/money';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'correct horse battery';

interface TicketBody {
  ticketNumber: string;
  status: string;
  bookingReference: string;
  passengerName: string;
  cabin: string;
  flight: Record<string, unknown>;
}

describe('Ticketing over HTTP', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let db: DataSource;
  let owner: string;
  let other: string;
  let admin: string;
  let flightId: string;

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

  async function provision(flightNumber: string, hours = 72) {
    const departure = Date.now() + hours * 3_600_000;
    return db.transaction('READ COMMITTED', async (tx) => {
      const flight = await app.get<CatalogApi>(CATALOG_API).createFlight(tx, {
        flightNumber,
        airlineCode: 'MS',
        originCode: 'CAI',
        destinationCode: 'LHR',
        scheduledDepartureUtc: new Date(departure),
        scheduledArrivalUtc: new Date(departure + 18_000_000),
        fares: { ECONOMY: money(1_500_000, 'EGP'), BUSINESS: money(4_500_000, 'EGP') },
      });
      if (!flight.ok) throw new Error(flight.error);
      await app.get<InventoryApi>(INVENTORY_API).setCapacity(tx, flight.value, 'ECONOMY', 20);
      return flight.value;
    });
  }

  async function reserve(forFlight = flightId) {
    const response = await post('/bookings')
      .send({ flightId: forFlight, cabin: 'ECONOMY' })
      .expect(201);
    return (response.body as { reference: string }).reference;
  }

  const pay = (reference: string) =>
    post(`/bookings/${reference}/payments`)
      .set('idempotency-key', randomUUID())
      .send({ token: 'tok_success' })
      .expect(201);

  async function ticketed() {
    const reference = await reserve();
    await pay(reference);
    const tickets = (await get(`/bookings/${reference}/tickets`).expect(200)).body as TicketBody[];
    return { reference, ticket: tickets[0] };
  }

  async function bookingId(reference: string) {
    const [row] = await db.query<{ id: string }[]>('SELECT id FROM bookings WHERE reference = $1', [
      reference,
    ]);
    return row.id;
  }

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    await app.listen(0, '127.0.0.1');
    db = app.get(DataSource);
    owner = await signIn('ticket-owner@example.com');
    other = await signIn('ticket-other@example.com');
    await seedAdmin(app, { email: 'ticket-admin@example.com', password: PASSWORD, name: 'Admin' });
    admin = await signIn('ticket-admin@example.com', false);
    flightId = await provision('MS910');
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('US-TK-01-T05 paying leaves the booking TICKETED with one valid 13-digit ticket', async () => {
    const { reference, ticket } = await ticketed();

    expect((await get(`/bookings/${reference}`).expect(200)).body).toMatchObject({
      status: 'TICKETED',
    });
    expect(ticket).toMatchObject({ status: 'VALID', bookingReference: reference });
    expect(ticket.ticketNumber).toMatch(/^\d{13}$/);
  });

  it('US-TK-01-T13 a family booking gets one ticket per passenger, infant included, each at their fare', async () => {
    const booked = await post('/bookings')
      .send({
        flightId,
        cabin: 'ECONOMY',
        passengers: [
          { firstName: 'Mona', lastName: 'Adel', birthDate: '1990-05-01', type: 'ADULT' },
          { firstName: 'Karim', lastName: 'Adel', birthDate: '1988-02-11', type: 'ADULT' },
          { firstName: 'Laila', lastName: 'Adel', birthDate: '2026-01-15', type: 'INFANT' },
        ],
      })
      .expect(201);
    const { reference } = booked.body as { reference: string };
    await pay(reference);

    const tickets = (await get(`/bookings/${reference}/tickets`).expect(200)).body as TicketBody[];

    expect(tickets.map(({ passengerName }) => passengerName).sort()).toEqual([
      'Karim Adel',
      'Laila Adel',
      'Mona Adel',
    ]);
    expect(new Set(tickets.map(({ ticketNumber }) => ticketNumber)).size).toBe(3);
    const fares = await db.query<{ passengerName: string; fareMinor: number }[]>(
      'SELECT "passengerName", "fareMinor" FROM tickets WHERE "bookingId" = $1 ORDER BY "passengerName"',
      [await bookingId(reference)],
    );
    expect(fares).toEqual([
      { passengerName: 'Karim Adel', fareMinor: 1_500_000 },
      { passengerName: 'Laila Adel', fareMinor: 150_000 },
      { passengerName: 'Mona Adel', fareMinor: 1_500_000 },
    ]);
  });

  it('US-TK-01-T03 the database refuses a repeated number and a second ticket for the same passenger and flight', async () => {
    const { reference, ticket } = await ticketed();
    const [row] = await db.query<Record<string, unknown>[]>(
      'SELECT * FROM tickets WHERE number = $1',
      [ticket.ticketNumber],
    );
    const insert = (fields: Record<string, unknown>) => {
      const values = { ...row, ...fields };
      const columns = Object.keys(values);
      return db.query(
        `INSERT INTO tickets (${columns.map((column) => `"${column}"`).join(', ')})
         VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
        Object.values(values),
      );
    };

    await expect(insert({ passengerId: randomUUID() })).rejects.toThrow(/duplicate key/);
    await expect(insert({ number: '9999999999999' })).rejects.toThrow(/duplicate key/);
    expect(
      await db.query('SELECT 1 FROM tickets WHERE "bookingId" = $1', [await bookingId(reference)]),
    ).toHaveLength(1);
  });

  it('US-TK-01-T04 issuing again returns the same tickets and creates none', async () => {
    const { reference, ticket } = await ticketed();
    const id = await bookingId(reference);

    const again = await app.get(IssueTickets).execute(id);

    expect(again).toMatchObject({ ok: true, value: [{ number: ticket.ticketNumber }] });
    expect(await db.query('SELECT 1 FROM tickets WHERE "bookingId" = $1', [id])).toHaveLength(1);
  });

  it('NFR-REL-02-T05 the repair job issues a booking left CONFIRMED, once, even when two runs overlap', async () => {
    await db.query(`ALTER TABLE tickets ADD CONSTRAINT reject_test_ticket CHECK (false) NOT VALID`);
    let reference: string;
    try {
      reference = await reserve();
      await pay(reference);
    } finally {
      await db.query('ALTER TABLE tickets DROP CONSTRAINT reject_test_ticket');
    }
    expect((await get(`/bookings/${reference}`).expect(200)).body).toMatchObject({
      status: 'CONFIRMED',
    });

    const job = app.get(TicketRepairJob);
    await Promise.all([job.run(), job.run()]);

    expect((await get(`/bookings/${reference}`).expect(200)).body).toMatchObject({
      status: 'TICKETED',
    });
    expect(
      await db.query('SELECT 1 FROM tickets WHERE "bookingId" = $1', [await bookingId(reference)]),
    ).toHaveLength(1);
  });

  it('US-TK-02-T01 the owner sees each ticket with passenger, flight, route, local times, cabin and reference', async () => {
    const { reference, ticket } = await ticketed();

    const byNumber = (await get(`/tickets/${ticket.ticketNumber}`).expect(200)).body as TicketBody;

    expect(byNumber).toEqual(ticket);
    expect(ticket).toMatchObject({
      ticketNumber: expect.stringMatching(/^\d{13}$/),
      status: 'VALID',
      bookingReference: reference,
      passengerName: 'Mona Adel',
      cabin: 'ECONOMY',
      flight: {
        flightNumber: 'MS910',
        airline: { code: 'MS' },
        origin: { code: 'CAI', city: expect.any(String) },
        destination: { code: 'LHR', city: expect.any(String) },
        scheduledDepartureLocal: expect.stringMatching(/\+02:00$/),
        scheduledArrivalLocal: expect.any(String),
        status: 'SCHEDULED',
      },
    });
  });

  it('US-TK-02-T02 another traveler gets not-found for the tickets and for each ticket', async () => {
    const { reference, ticket } = await ticketed();

    await get(`/bookings/${reference}/tickets`, other).expect(404);
    await get(`/tickets/${ticket.ticketNumber}`, other).expect(404);
    await get(`/tickets/${ticket.ticketNumber}/print`, other).expect(404);
  });

  it("US-TK-02-T03 a ticket shows its flight's current status, including a delay", async () => {
    const delayedFlight = await provision('MS911');
    const reference = await reserve(delayedFlight);
    await pay(reference);
    const [scheduled] = (await get(`/bookings/${reference}/tickets`).expect(200))
      .body as TicketBody[];
    const estimate = new Date(Date.now() + 75 * 3_600_000).toISOString();

    await server()
      .patch(`/admin/flights/${delayedFlight}/status`)
      .set('x-requested-with', 'fetch')
      .set('cookie', admin)
      .send({ status: 'DELAYED', estimatedDepartureUtc: estimate })
      .expect(200);

    const view = (await get(`/tickets/${scheduled.ticketNumber}`).expect(200)).body as TicketBody;
    expect(view.flight).toMatchObject({
      status: 'DELAYED',
      estimatedDepartureLocal: expect.any(String),
    });
  });

  it('US-TK-03-T01 cancelling voids the tickets with the booking, and a failed void cancels nothing', async () => {
    const { reference, ticket } = await ticketed();
    await db.query(
      `ALTER TABLE tickets ADD CONSTRAINT reject_test_void CHECK (status <> 'VOID') NOT VALID`,
    );
    try {
      await post(`/bookings/${reference}/cancel`).expect(500);
    } finally {
      await db.query('ALTER TABLE tickets DROP CONSTRAINT reject_test_void');
    }
    expect((await get(`/bookings/${reference}`).expect(200)).body).toMatchObject({
      status: 'TICKETED',
    });
    expect((await get(`/tickets/${ticket.ticketNumber}`).expect(200)).body).toMatchObject({
      status: 'VALID',
    });

    await post(`/bookings/${reference}/cancel`).expect(200);

    expect((await get(`/bookings/${reference}`).expect(200)).body).toMatchObject({
      status: 'CANCELLED',
    });
    expect((await get(`/tickets/${ticket.ticketNumber}`).expect(200)).body).toMatchObject({
      status: 'VOID',
    });
  });

  it('US-TK-03-T02 a voided number is never handed out again', async () => {
    const voided = await ticketed();
    await post(`/bookings/${voided.reference}/cancel`).expect(200);

    const next = await ticketed();

    expect(next.ticket.ticketNumber).not.toBe(voided.ticket.ticketNumber);
    expect(BigInt(next.ticket.ticketNumber)).toBeGreaterThan(BigInt(voided.ticket.ticketNumber));
  });

  it('US-TK-03-T03 cancelling again leaves the void ticket exactly as it was', async () => {
    const { reference, ticket } = await ticketed();
    await post(`/bookings/${reference}/cancel`).expect(200);
    const voidedAt = () =>
      db.query('SELECT "voidedAt", status FROM tickets WHERE number = $1', [ticket.ticketNumber]);
    const before = await voidedAt();

    await post(`/bookings/${reference}/cancel`).expect(200);

    expect(await voidedAt()).toEqual(before);
    expect(before).toEqual([{ voidedAt: expect.any(Date), status: 'VOID' }]);
  });

  it('US-TK-04-T01 the printable ticket carries number, name, flight, local times and reference', async () => {
    const { reference, ticket } = await ticketed();

    const printable = (await get(`/tickets/${ticket.ticketNumber}/print`).expect(200)).body;

    expect(printable).toMatchObject({
      ticketNumber: ticket.ticketNumber,
      passengerName: 'Mona Adel',
      bookingReference: reference,
      flightNumber: 'MS910',
      from: 'CAI',
      to: 'LHR',
      departureLocal: expect.any(String),
      arrivalLocal: expect.any(String),
      voidMarking: null,
    });
  });

  it('US-TK-04-T02 a void ticket prints with a VOID marking', async () => {
    const { reference, ticket } = await ticketed();
    await post(`/bookings/${reference}/cancel`).expect(200);

    const printable = (await get(`/tickets/${ticket.ticketNumber}/print`).expect(200)).body;

    expect(printable).toMatchObject({ status: 'VOID', voidMarking: 'VOID' });
  });

  it('US-TK-04-T03 only the owner can open the printable ticket', async () => {
    const { ticket } = await ticketed();

    await get(`/tickets/${ticket.ticketNumber}/print`, other).expect(404);
    await server().get(`/tickets/${ticket.ticketNumber}/print`).expect(401);
  });
});
