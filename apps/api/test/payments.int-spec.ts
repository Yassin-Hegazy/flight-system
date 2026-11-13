import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedAdmin } from '../src/database/seed-admin';
import { CATALOG_API, type CatalogApi } from '../src/modules/flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../src/modules/inventory/index';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
  RecoverPayments,
} from '../src/modules/payments/index';
import { money } from '../src/shared/money';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

describe('Payments over HTTP', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let db: DataSource;
  let gateway: PaymentGateway;
  let flightId: string;
  let owner: string;
  let other: string;
  let admin: string;
  let recovery: RecoverPayments;

  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set('x-requested-with', 'fetch');

  async function traveler(email: string) {
    const password = 'correct horse battery';
    await post('/users/register').send({ email, password, name: 'Traveler' }).expect(201);
    const login = await post('/users/sign-in').send({ email, password }).expect(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    return cookies.find((value) => value.startsWith('flight_session='))!.split(';')[0];
  }

  async function reserve(forFlight = flightId) {
    const response = await post('/bookings')
      .set('cookie', owner)
      .send({ flightId: forFlight, cabin: 'ECONOMY' })
      .expect(201);
    return (response.body as { reference: string }).reference;
  }

  const pay = (reference: string, key: string, cookie = owner) =>
    post(`/bookings/${reference}/payments`).set('cookie', cookie).set('idempotency-key', key);
  const read = (reference: string) =>
    request(app.getHttpServer()).get(`/bookings/${reference}`).set('cookie', owner);
  const stored = (reference: string) =>
    db.query<{ status: string; seatStatus: string; paymentStatus: string; cardLast4: string }[]>(
      `SELECT b.status, h.status AS "seatStatus", p.status AS "paymentStatus", p."cardLast4"
       FROM bookings b JOIN seat_holds h ON h.id = b."holdId"
       JOIN payments p ON p."bookingId" = b.id WHERE b.reference = $1`,
      [reference],
    );

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    await app.listen(0, '127.0.0.1');
    db = app.get(DataSource);
    gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
    owner = await traveler('payer@example.com');
    other = await traveler('other@example.com');
    recovery = app.get(RecoverPayments);
    const credentials = {
      email: 'payments-admin@example.com',
      password: 'correct horse battery',
      name: 'Admin',
    };
    await seedAdmin(app, credentials);
    const login = await post('/users/sign-in').send(credentials).expect(200);
    admin = (login.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('flight_session='))!
      .split(';')[0];
    flightId = await provision('MS902', 48);
  });

  async function provision(flightNumber: string, hours: number) {
    const catalog = app.get<CatalogApi>(CATALOG_API);
    const inventory = app.get<InventoryApi>(INVENTORY_API);
    const tomorrow = Date.now() + hours * 3_600_000;
    return db.transaction('READ COMMITTED', async (tx) => {
      const flight = await catalog.createFlight(tx, {
        flightNumber,
        airlineCode: 'MS',
        originCode: 'CAI',
        destinationCode: 'LHR',
        scheduledDepartureUtc: new Date(tomorrow),
        scheduledArrivalUtc: new Date(tomorrow + 18_000_000),
        fares: { ECONOMY: money(1500000, 'EGP'), BUSINESS: money(4500000, 'EGP') },
      });
      if (!flight.ok) throw new Error(flight.error);
      const seats = await inventory.setCapacity(tx, flight.value, 'ECONOMY', 40);
      if (!seats.ok) throw new Error('Could not provision test seats');
      return flight.value;
    });
  }

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  it('US-PAY-01-T01 pays the snapshot, commits the seat, and notifies after confirmation', async () => {
    const reference = await reserve();
    const charge = vi.spyOn(gateway, 'charge');
    try {
      const response = await pay(reference, randomUUID())
        .send({ token: 'tok_success' })
        .expect(201);
      expect(response.body).toMatchObject({
        status: 'SUCCEEDED',
        amount: { amountMinor: 1500000, currency: 'EGP' },
        card: { brand: 'VISA', last4: '4242' },
      });
      expect(charge).toHaveBeenCalledExactlyOnceWith({
        token: 'tok_success',
        amount: { amountMinor: 1500000, currency: 'EGP' },
        idempotencyKey: (response.body as { id: string }).id,
      });
      expect(await stored(reference)).toEqual([
        {
          status: 'CONFIRMED',
          seatStatus: 'COMMITTED',
          paymentStatus: 'SUCCEEDED',
          cardLast4: '4242',
        },
      ]);
      const inbox = await request(app.getHttpServer())
        .get('/notifications')
        .set('cookie', owner)
        .expect(200);
      expect(inbox.body).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            type: 'BookingConfirmed',
            title: `Booking ${reference} confirmed`,
          }),
          expect.objectContaining({ type: 'TicketsIssued' }),
        ]),
      });
    } finally {
      charge.mockRestore();
    }
  });

  it('US-PAY-01-T02 refuses a different owner, an expired hold and unexpected card fields before charge', async () => {
    const reference = await reserve();
    const charge = vi.spyOn(gateway, 'charge');
    try {
      await pay(reference, randomUUID(), other).send({ token: 'tok_success' }).expect(404);
      await pay(reference, randomUUID()).send({ token: 'tok_success', amount: 1 }).expect(400);
      await pay(reference, randomUUID()).send({ token: '4242424242424242' }).expect(400);
      await db.query(
        `UPDATE seat_holds SET "expiresAt" = now() - interval '1 minute'
         WHERE id = (SELECT "holdId" FROM bookings WHERE reference = $1)`,
        [reference],
      );
      const response = await pay(reference, randomUUID())
        .send({ token: 'tok_success' })
        .expect(409);
      expect(response.body).toMatchObject({ code: 'HOLD_EXPIRED' });
      expect(charge).not.toHaveBeenCalled();
    } finally {
      charge.mockRestore();
    }
  });

  it('US-PAY-01-T03 payment and booking roll back together if settlement fails', async () => {
    const reference = await reserve();
    await db.query(
      `ALTER TABLE payments ADD CONSTRAINT test_fail_settlement CHECK (status <> 'SUCCEEDED') NOT VALID`,
    );
    try {
      await pay(reference, randomUUID()).send({ token: 'tok_success' }).expect(500);
      expect(await stored(reference)).toEqual([
        {
          status: 'PENDING_PAYMENT',
          seatStatus: 'HELD',
          paymentStatus: 'PENDING',
          cardLast4: null,
        },
      ]);
    } finally {
      await db.query('ALTER TABLE payments DROP CONSTRAINT test_fail_settlement');
    }
  });

  it('US-PAY-03-T01 concurrent keys charge once and the winning key replays the same result', async () => {
    const reference = await reserve();
    const keys = [randomUUID(), randomUUID()];
    const charge = vi.spyOn(gateway, 'charge');
    try {
      const responses = await Promise.all(
        keys.map((key) => pay(reference, key).send({ token: 'tok_success' })),
      );
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      const winner = responses.findIndex(({ status }) => status === 201);
      const replay = await pay(reference, keys[winner]).send({ token: 'tok_success' }).expect(201);
      expect(replay.body).toEqual(responses[winner].body);
      const changed = await pay(reference, keys[winner])
        .send({ token: 'tok_declined' })
        .expect(409);
      expect(changed.body).toMatchObject({ code: 'KEY_REUSED' });
      const paid = await pay(reference, randomUUID()).send({ token: 'tok_success' }).expect(409);
      expect(paid.body).toMatchObject({ code: 'ALREADY_PAID' });
      expect(charge).toHaveBeenCalledTimes(1);
    } finally {
      charge.mockRestore();
    }
  });

  it('US-PAY-03-T02 a replay stays pending after an ambiguous provider result and does not charge again', async () => {
    const reference = await reserve();
    const key = randomUUID();
    const charge = vi.spyOn(gateway, 'charge');
    try {
      const first = await pay(reference, key).send({ token: 'tok_timeout' }).expect(202);
      const replay = await pay(reference, key).send({ token: 'tok_timeout' }).expect(202);
      expect(replay.body).toEqual(first.body);
      expect(charge).toHaveBeenCalledTimes(1);
      const booking = await read(reference).expect(200);
      expect(booking.body).toMatchObject({ status: 'PENDING_PAYMENT' });
    } finally {
      charge.mockRestore();
    }
  });

  it('US-PAY-01-T04 accepts a different adapter and refunds a charge if the hold expires in flight', async () => {
    const reference = await reserve();
    const charge = vi.spyOn(gateway, 'charge').mockImplementationOnce(async () => {
      await db.query(
        `UPDATE seat_holds SET "expiresAt" = now() - interval '1 minute'
         WHERE id = (SELECT "holdId" FROM bookings WHERE reference = $1)`,
        [reference],
      );
      return {
        status: 'SUCCEEDED',
        gatewayRef: 'other-adapter',
        brand: 'MASTERCARD',
        last4: '9999',
      };
    });
    const refund = vi.spyOn(gateway, 'refund');
    try {
      const key = randomUUID();
      const first = await pay(reference, key).send({ token: 'tok_success' }).expect(409);
      expect(first.body).toMatchObject({ code: 'HOLD_EXPIRED' });
      await pay(reference, key).send({ token: 'tok_success' }).expect(409);
      expect(refund).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          gatewayRef: 'other-adapter',
          amount: { amountMinor: 1500000, currency: 'EGP' },
        }),
      );
      expect(charge).toHaveBeenCalledTimes(1);
      expect(await stored(reference)).toEqual([
        {
          status: 'PENDING_PAYMENT',
          seatStatus: 'HELD',
          paymentStatus: 'SUCCEEDED',
          cardLast4: '9999',
        },
      ]);
    } finally {
      charge.mockRestore();
      refund.mockRestore();
    }
  });

  const receipt = (reference: string, cookie = owner) =>
    request(app.getHttpServer()).get(`/bookings/${reference}/receipt`).set('cookie', cookie);
  const cancel = (reference: string, cookie = owner) =>
    post(`/bookings/${reference}/cancel`).set('cookie', cookie);

  async function expireHold(reference: string) {
    await db.query(
      `UPDATE seat_holds SET "expiresAt" = now() - interval '1 minute'
      WHERE id = (SELECT "holdId" FROM bookings WHERE reference = $1)`,
      [reference],
    );
  }

  async function makeRecoveryDue(reference: string) {
    await db.query(
      `UPDATE payments SET "recoveryAt" = now() - interval '1 minute'
      WHERE "bookingId" = (SELECT id FROM bookings WHERE reference = $1)`,
      [reference],
    );
  }

  it('US-PAY-02-T01 shows the decline reason, keeps the original hold and records both attempts', async () => {
    const reference = await reserve();
    const hold = () =>
      db.query(
        `SELECT h.status, h."expiresAt" FROM seat_holds h
      JOIN bookings b ON b."holdId" = h.id WHERE b.reference = $1`,
        [reference],
      );
    const before = await hold();
    const key = randomUUID();
    const decline = await pay(reference, key).send({ token: 'tok_declined' }).expect(400);
    expect(decline.body).toMatchObject({
      code: 'DECLINED',
      fieldErrors: { reason: 'insufficient_funds' },
    });
    await pay(reference, key).send({ token: 'tok_declined' }).expect(400);
    expect(await hold()).toEqual(before);
    expect((await read(reference).expect(200)).body).toMatchObject({ status: 'PENDING_PAYMENT' });
    await pay(reference, randomUUID()).send({ token: 'tok_success' }).expect(201);
    expect(await stored(reference)).toHaveLength(2);
  });

  it('US-PAY-04-T01 records cancellation atomically, retries a failed refund and sends once per claim', async () => {
    const reference = await reserve();
    await pay(reference, randomUUID()).send({ token: 'tok_success' }).expect(201);
    const refund = vi
      .spyOn(gateway, 'refund')
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('gateway down'));
    try {
      await cancel(reference, other).expect(404);
      await cancel(reference).expect(200);
      await cancel(reference).expect(200);
      expect(await stored(reference)).toMatchObject([
        { status: 'CANCELLED', seatStatus: 'RELEASED' },
      ]);
      expect((await receipt(reference).expect(200)).body).toMatchObject({
        refund: { status: 'PENDING', amount: { amountMinor: 1500000, currency: 'EGP' } },
      });
      const nextMinute = new Date(Date.now() + 61_000);
      await Promise.all([recovery.run(nextMinute), recovery.run(nextMinute)]);
      await recovery.run(new Date(nextMinute.getTime() + 61_000));
      expect(refund).toHaveBeenCalledTimes(3);
      expect(new Set(refund.mock.calls.map(([call]) => call.idempotencyKey)).size).toBe(1);
      const [attempt] = refund.mock.calls[0];
      expect(
        await db.query('SELECT "refundId" FROM mock_gateway_refunds WHERE "chargeRef" = $1', [
          attempt.gatewayRef,
        ]),
      ).toEqual([{ refundId: attempt.idempotencyKey }]);
      expect((await receipt(reference).expect(200)).body).toMatchObject({
        refund: { status: 'SUCCEEDED' },
      });
    } finally {
      refund.mockRestore();
    }
  });

  it('US-PAY-04-T02 airline cancellation bypasses the traveler cutoff and refunds all paid bookings', async () => {
    const nearFlight = await provision('MS903', 10);
    const paid = await reserve(nearFlight);
    const pending = await reserve(nearFlight);
    await pay(paid, randomUUID()).send({ token: 'tok_success' }).expect(201);
    const refused = await cancel(paid).expect(409);
    expect(refused.body).toMatchObject({ code: 'CANCELLATION_CUTOFF' });
    await post(`/admin/flights/${nearFlight}/cancel`)
      .set('cookie', admin)
      .send({ reason: 'Maintenance' })
      .expect(200);
    expect((await read(pending).expect(200)).body).toMatchObject({ status: 'CANCELLED' });
    expect((await receipt(paid).expect(200)).body).toMatchObject({
      refund: { status: 'SUCCEEDED' },
    });
  });

  it('US-PAY-04-T03 a failed refund insert rolls back the cancellation and seat release', async () => {
    const reference = await reserve();
    await pay(reference, randomUUID()).send({ token: 'tok_success' }).expect(201);
    await db.query(
      `ALTER TABLE refunds ADD CONSTRAINT test_fail_refund CHECK (status <> 'PENDING') NOT VALID`,
    );
    try {
      await cancel(reference).expect(500);
      expect(await stored(reference)).toMatchObject([
        { status: 'CONFIRMED', seatStatus: 'COMMITTED' },
      ]);
      expect((await receipt(reference).expect(200)).body).toMatchObject({ refund: null });
    } finally {
      await db.query('ALTER TABLE refunds DROP CONSTRAINT test_fail_refund');
    }
  });

  it('US-PAY-05-T01 returns an owner-only receipt with timestamps and masked card data', async () => {
    const reference = await reserve();
    await pay(reference, randomUUID()).send({ token: 'tok_success' }).expect(201);
    const response = await receipt(reference).expect(200);
    expect(response.body).toMatchObject({
      bookingReference: reference,
      status: 'SUCCEEDED',
      createdAt: expect.any(String),
      resolvedAt: expect.any(String),
      card: { brand: 'VISA', last4: '4242' },
      refund: null,
    });
    expect(response.body).not.toHaveProperty('gatewayRef');
    expect(response.body).not.toHaveProperty('idempotencyKey');
    await receipt(reference, other).expect(404);
  });

  it('US-PAY-06-T01 recovers a timeout once under concurrent job runs and confirms the booking', async () => {
    const reference = await reserve();
    const key = randomUUID();
    await pay(reference, key).send({ token: 'tok_timeout' }).expect(202);
    await recovery.run();
    expect((await read(reference).expect(200)).body).toMatchObject({ status: 'PENDING_PAYMENT' });
    await makeRecoveryDue(reference);
    const restarted = await createTestApp(database.url);
    try {
      const anotherWorker = restarted.get(RecoverPayments);
      await Promise.all([anotherWorker.run(), anotherWorker.run()]);
    } finally {
      await restarted.close();
    }
    expect(await stored(reference)).toMatchObject([
      { status: 'CONFIRMED', seatStatus: 'COMMITTED', paymentStatus: 'SUCCEEDED' },
    ]);
    await pay(reference, key).send({ token: 'tok_timeout' }).expect(201);
    const inbox = await request(app.getHttpServer())
      .get('/notifications')
      .set('cookie', owner)
      .expect(200);
    const items = (inbox.body as { items: { title: string }[] }).items;
    expect(items.filter((item) => item.title === `Booking ${reference} confirmed`)).toHaveLength(1);
  });

  it('US-PAY-06-T02 refunds a recovered charge when the hold expired', async () => {
    const reference = await reserve();
    await pay(reference, randomUUID()).send({ token: 'tok_timeout' }).expect(202);
    await expireHold(reference);
    await makeRecoveryDue(reference);
    await recovery.run();
    expect((await receipt(reference).expect(200)).body).toMatchObject({
      status: 'SUCCEEDED',
      refund: { status: 'SUCCEEDED', amount: { amountMinor: 1500000, currency: 'EGP' } },
    });
    expect((await read(reference).expect(200)).body).toMatchObject({ status: 'PENDING_PAYMENT' });
  });

  it('US-PAY-06-T03 closes an uncharged attempt and allows another key while the hold is valid', async () => {
    const reference = await reserve();
    const charge = vi
      .spyOn(gateway, 'charge')
      .mockRejectedValueOnce(new Error('request never reached the gateway'));
    try {
      const key = randomUUID();
      await pay(reference, key).send({ token: 'tok_success' }).expect(202);
      await makeRecoveryDue(reference);
      await recovery.run();
      const failed = await pay(reference, key).send({ token: 'tok_success' }).expect(400);
      expect(failed.body).toMatchObject({ code: 'DECLINED', fieldErrors: { reason: 'no_charge' } });
      await pay(reference, randomUUID()).send({ token: 'tok_success' }).expect(201);
    } finally {
      charge.mockRestore();
    }
  });
});
