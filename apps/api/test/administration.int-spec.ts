import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedAdmin } from '../src/database/seed-admin';
import { INVENTORY_API, type InventoryApi } from '../src/modules/inventory/index';
import type { FlightDelayed } from '../src/shared/events';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'correct horse battery';

describe('Administration over HTTP', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let inventory: InventoryApi;
  let admin: string;
  let traveler: string;

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    inventory = app.get<InventoryApi>(INVENTORY_API);
    await seedAdmin(app, { email: 'ops@example.com', password: PASSWORD, name: 'Operations' });
    admin = await signIn('ops@example.com');
    await post('/users/register').send({
      email: 'traveler@example.com',
      password: PASSWORD,
      name: 'A Traveler',
    });
    traveler = await signIn('traveler@example.com');
    // Airlines and airports (MS, CAI, LHR, ...) come from the reference-data seed migration.
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  const post = (url: string) =>
    request(app.getHttpServer()).post(url).set('x-requested-with', 'fetch');
  const patch = (url: string) =>
    request(app.getHttpServer()).patch(url).set('x-requested-with', 'fetch');
  const get = (url: string) => request(app.getHttpServer()).get(url);

  async function signIn(email: string): Promise<string> {
    const response = await post('/users/sign-in').send({ email, password: PASSWORD }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies.find((value) => value.startsWith('flight_session='))!.split(';')[0];
  }

  // Every test schedules MS777 on its own day, so tests never collide on the one-per-day rule.
  let day = 0;
  function flightBody(overrides: Record<string, unknown> = {}) {
    day += 1;
    const date = new Date(Date.UTC(2027, 5, day)).toISOString().slice(0, 10);
    return {
      flightNumber: 'MS777',
      airlineCode: 'MS',
      originCode: 'CAI',
      destinationCode: 'LHR',
      scheduledDepartureUtc: `${date}T06:00:00Z`,
      scheduledArrivalUtc: `${date}T11:00:00Z`,
      currency: 'EGP',
      fares: { ECONOMY: 1_500_000, BUSINESS: 4_500_000 },
      capacity: { ECONOMY: 180, BUSINESS: 20 },
      ...overrides,
    };
  }
  const localDateOf = (body: { scheduledDepartureUtc: string }) =>
    body.scheduledDepartureUtc.slice(0, 10);

  const createFlight = (body: object, cookie = admin) =>
    post('/admin/flights').set('cookie', cookie).send(body);
  const setStatus = (id: string, body: object, cookie = admin) =>
    patch(`/admin/flights/${id}/status`).set('cookie', cookie).send(body);
  const idOf = (response: Response) => (response.body as { id: string }).id;

  async function search(body: { scheduledDepartureUtc: string }) {
    const response = await get('/flights')
      .query({ origin: 'CAI', destination: 'LHR', date: localDateOf(body) })
      .expect(200);
    return response.body as { id: string; fares: Record<string, { amountMinor: number }> }[];
  }

  describe('US-AD-01 Create a scheduled flight', () => {
    it('US-AD-01-T01 a traveler gets 403, an anonymous caller 401, and nothing is created', async () => {
      const body = flightBody();

      expect((await createFlight(body, traveler).expect(403)).body.code).toBe('FORBIDDEN');
      await post('/admin/flights').send(body).expect(401);

      expect(await search(body)).toEqual([]);
    });

    it("US-AD-01-T02 the Catalog's rules are surfaced with their own code", async () => {
      const body = flightBody();
      await createFlight(body).expect(201);

      const duplicate = await createFlight(body).expect(409);
      expect(duplicate.body.code).toBe('DUPLICATE_FLIGHT');

      const sameAirport = await createFlight(flightBody({ destinationCode: 'CAI' })).expect(400);
      expect(sameAirport.body.code).toBe('SAME_AIRPORT');
    });

    it.each([
      { field: 'capacity', value: { ECONOMY: 0, BUSINESS: 0 }, status: 400, code: 'NO_SEATS' },
      { field: 'capacity', value: { ECONOMY: 1, BUSINESS: 0 }, status: 201 },
      { field: 'capacity', value: { ECONOMY: -1, BUSINESS: 5 }, status: 400 },
      { field: 'capacity', value: { ECONOMY: 600, BUSINESS: 0 }, status: 201 },
      { field: 'capacity', value: { ECONOMY: 601, BUSINESS: 0 }, status: 400 },
      { field: 'fares', value: { ECONOMY: 0, BUSINESS: 4_500_000 }, status: 400 },
      { field: 'fares', value: { ECONOMY: 1, BUSINESS: 1 }, status: 201 },
      { field: 'fares', value: { ECONOMY: 1500.5, BUSINESS: 4_500_000 }, status: 400 },
    ])(
      'US-AD-01-T03 boundary: $field $value answers $status',
      async ({ field, value, status, code }) => {
        const response = await createFlight(flightBody({ [field]: value })).expect(status);
        if (status === 400) {
          expect(response.body.code).toBe(code ?? 'VALIDATION_ERROR');
        }
      },
    );

    it('US-AD-01-T04 a created flight is searchable at once, with its fares and both cabins of seats', async () => {
      const body = flightBody({ capacity: { ECONOMY: 150, BUSINESS: 0 } });

      const id = idOf(await createFlight(body).expect(201));

      const found = await search(body);
      expect(found.map((flight) => flight.id)).toEqual([id]);
      expect(found[0].fares.ECONOMY.amountMinor).toBe(1_500_000);
      const load = await inventory.cabinLoad(id);
      expect(load.ok && load.value.map(({ cabin, capacity }) => ({ cabin, capacity }))).toEqual([
        { cabin: 'ECONOMY', capacity: 150 },
        { cabin: 'BUSINESS', capacity: 0 },
      ]);
    });

    it('US-AD-01-T22 a failure while setting capacity leaves no flight behind', async () => {
      const body = flightBody();
      const setCapacity = vi
        .spyOn(inventory, 'setCapacity')
        .mockRejectedValueOnce(new Error('injected fault'));

      await createFlight(body).expect(500);
      setCapacity.mockRestore();

      expect(await search(body)).toEqual([]);
    });

    it('US-AD-01-T23 an instant without a zone is rejected, never read as server time', async () => {
      const response = await createFlight(
        flightBody({ scheduledDepartureUtc: '2027-09-01T06:00:00' }),
      ).expect(400);
      expect(response.body.fieldErrors).toHaveProperty('scheduledDepartureUtc');
    });
  });

  describe('US-AD-02 Update a flight status', () => {
    async function scheduled() {
      const body = flightBody();
      return { id: idOf(await createFlight(body).expect(201)), body };
    }
    const statusOf = async (id: string) =>
      (await get(`/flights/${id}`).expect(200)).body as {
        status: string;
        estimatedDepartureUtc?: string;
      };

    it('US-AD-02-T01 a transition outside the status table is refused and changes nothing', async () => {
      const { id } = await scheduled();

      const response = await setStatus(id, { status: 'ARRIVED' }).expect(409);

      expect(response.body.code).toBe('INVALID_TRANSITION');
      expect((await statusOf(id)).status).toBe('SCHEDULED');
    });

    it('US-AD-02-T02 a delay to the scheduled time is refused; one minute later is accepted', async () => {
      const { id, body } = await scheduled();
      const oneMinuteLater = body.scheduledDepartureUtc.replace('06:00:00Z', '06:01:00Z');

      const same = await setStatus(id, {
        status: 'DELAYED',
        estimatedDepartureUtc: body.scheduledDepartureUtc,
      }).expect(400);
      expect(same.body.code).toBe('ESTIMATE_NOT_AFTER_SCHEDULED');
      expect((await setStatus(id, { status: 'DELAYED' }).expect(400)).body.code).toBe(
        'ESTIMATE_REQUIRED',
      );

      await setStatus(id, { status: 'DELAYED', estimatedDepartureUtc: oneMinuteLater }).expect(200);
      expect(await statusOf(id)).toMatchObject({
        status: 'DELAYED',
        estimatedDepartureUtc: new Date(oneMinuteLater).toISOString(),
      });
    });

    it('US-AD-02-T03 a delay publishes FlightDelayed after the change is committed', async () => {
      const { id, body } = await scheduled();
      const newDeparture = body.scheduledDepartureUtc.replace('06:00:00Z', '08:30:00Z');
      const seen: { event: FlightDelayed; statusWhenPublished: string }[] = [];
      const events = app.get(EventEmitter2);
      const listener = async (event: FlightDelayed) => {
        seen.push({ event, statusWhenPublished: (await statusOf(id)).status });
      };
      // emitAsync awaits the promise a listener returns, so the publisher waits for this one.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      events.on('FlightDelayed', listener);

      await setStatus(id, { status: 'DELAYED', estimatedDepartureUtc: newDeparture }).expect(200);
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      events.off('FlightDelayed', listener);

      expect(seen).toHaveLength(1);
      // Another connection already sees DELAYED, so the event came after COMMIT.
      expect(seen[0].statusWhenPublished).toBe('DELAYED');
      expect(seen[0].event).toMatchObject({
        type: 'FlightDelayed',
        flightId: id,
        flightNumber: 'MS777',
        departureTimeZone: 'Africa/Cairo',
        affectedUserIds: [],
        oldDepartureUtc: new Date(body.scheduledDepartureUtc).toISOString(),
        newDepartureUtc: new Date(newDeparture).toISOString(),
      });
    });

    it('US-AD-02-T09 a traveler cannot change a status', async () => {
      const { id } = await scheduled();

      await setStatus(id, { status: 'BOARDING' }, traveler).expect(403);

      expect((await statusOf(id)).status).toBe('SCHEDULED');
    });

    it('US-AD-02-T10 CANCELLED is refused here; an unknown or malformed flight ID is a 404', async () => {
      const { id } = await scheduled();

      expect((await setStatus(id, { status: 'CANCELLED' }).expect(400)).body.code).toBe(
        'USE_CANCEL_FLIGHT',
      );
      expect((await statusOf(id)).status).toBe('SCHEDULED');
      await setStatus('00000000-0000-4000-8000-000000000000', { status: 'BOARDING' }).expect(404);
      await setStatus('not-a-uuid', { status: 'BOARDING' }).expect(404);
    });
  });
});
