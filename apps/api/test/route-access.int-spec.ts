import type { INestApplication } from '@nestjs/common';
import request, { type Response, type Test } from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAdmin } from '../src/database/seed-admin';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

/**
 * NFR-SEC-02 / US-USR-01-T01: every route with the access it requires (S1 section 5). A route the
 * app serves but this list lacks fails the completeness test, so a new route cannot ship unguarded
 * by accident.
 *
 * - public: anyone
 * - signedIn: any signed-in user; anonymous gets 401
 * - owner: signed in, and only on the caller's own record; anyone else's is a 404
 * - admin: administrators only; anonymous gets 401, a traveler 403
 */
type Access = 'public' | 'signedIn' | 'owner' | 'admin';

interface RouteSpec {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  access: Access;
  /** A valid body, so validation never answers before the access check is reached. */
  body?: () => object;
}

const PASSWORD = 'correct horse battery';
let unique = 0;
const freshEmail = () => `matrix${++unique}@example.com`;

const ROUTES: RouteSpec[] = [
  { method: 'get', path: '/health', access: 'public' },
  { method: 'get', path: '/flights', access: 'public' },
  { method: 'get', path: '/flights/airports/suggestions', access: 'public' },
  { method: 'get', path: '/flights/:id', access: 'public' },
  {
    method: 'post',
    path: '/users/register',
    access: 'public',
    body: () => ({ email: freshEmail(), password: PASSWORD, name: 'Matrix User' }),
  },
  {
    method: 'post',
    path: '/users/sign-in',
    access: 'public',
    body: () => ({ email: freshEmail(), password: PASSWORD }),
  },
  { method: 'post', path: '/users/sign-out', access: 'public' },
  { method: 'get', path: '/users/me', access: 'signedIn' },
  { method: 'patch', path: '/users/me', access: 'signedIn', body: () => ({ name: 'Renamed' }) },
  {
    method: 'patch',
    path: '/users/me/password',
    access: 'signedIn',
    body: () => ({ current: 'not the password', next: 'a brand new password' }),
  },
  { method: 'get', path: '/users/me/saved-travelers', access: 'signedIn' },
  {
    method: 'post',
    path: '/users/me/saved-travelers',
    access: 'signedIn',
    body: () => ({ name: 'Saved Person', dateOfBirth: '1990-05-01' }),
  },
  {
    method: 'patch',
    path: '/users/me/saved-travelers/:id',
    access: 'owner',
    body: () => ({ name: 'Renamed Person', dateOfBirth: '1990-05-01' }),
  },
  { method: 'delete', path: '/users/me/saved-travelers/:id', access: 'owner' },
  { method: 'get', path: '/notifications', access: 'signedIn' },
  { method: 'post', path: '/notifications/read-all', access: 'signedIn' },
  { method: 'patch', path: '/notifications/:id/read', access: 'owner' },
  {
    method: 'post',
    path: '/users/admins',
    access: 'admin',
    body: () => ({ email: freshEmail(), password: PASSWORD, name: 'Matrix Admin' }),
  },
];

describe('NFR-SEC-02 every route is authorised', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  const cookieOf = (response: Response) =>
    (response.headers['set-cookie'] as unknown as string[])
      .find((value) => value.startsWith('flight_session='))!
      .split(';')[0];

  async function travelerCookie(): Promise<string> {
    const email = freshEmail();
    const server = request(app.getHttpServer());
    await server
      .post('/users/register')
      .set('x-requested-with', 'fetch')
      .send({ email, password: PASSWORD, name: 'Matrix User' })
      .expect(201);
    return cookieOf(
      await request(app.getHttpServer())
        .post('/users/sign-in')
        .set('x-requested-with', 'fetch')
        .send({ email, password: PASSWORD })
        .expect(200),
    );
  }

  async function adminCookie(): Promise<string> {
    const email = freshEmail();
    await seedAdmin(app, { email, password: PASSWORD, name: 'Matrix Admin' });
    return cookieOf(
      await request(app.getHttpServer())
        .post('/users/sign-in')
        .set('x-requested-with', 'fetch')
        .send({ email, password: PASSWORD })
        .expect(200),
    );
  }

  /** A saved traveler owned by the user with this cookie: the record "owner" routes act on. */
  async function savedTravelerOf(cookie: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/users/me/saved-travelers')
      .set('x-requested-with', 'fetch')
      .set('cookie', cookie)
      .send({ name: 'Owned Person', dateOfBirth: '1985-03-02' })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  function call(route: RouteSpec, cookie: string | null, id?: string): Test {
    const path = route.path.replace(':id', id ?? '00000000-0000-4000-8000-000000000000');
    let pending = request(app.getHttpServer())[route.method](path);
    if (route.method !== 'get') pending = pending.set('x-requested-with', 'fetch');
    if (cookie) pending = pending.set('cookie', cookie);
    return route.body ? pending.send(route.body()) : pending;
  }

  const label = (route: RouteSpec) => `${route.method.toUpperCase()} ${route.path}`;

  it('US-USR-01-T01 anonymous: 401 on every route that is not public', async () => {
    for (const route of ROUTES.filter((candidate) => candidate.access !== 'public')) {
      const response = await call(route, null);
      expect({ route: label(route), status: response.status }).toEqual({
        route: label(route),
        status: 401,
      });
    }
  });

  it('US-USR-01-T07 a traveler: 403 on admin routes, through on their own routes', async () => {
    const cookie = await travelerCookie();
    for (const route of ROUTES.filter((candidate) => candidate.access !== 'public')) {
      const id = route.access === 'owner' ? await savedTravelerOf(cookie) : undefined;
      const response = await call(route, cookie, id);
      const expected = route.access === 'admin' ? 403 : 'allowed';
      const actual = [401, 403].includes(response.status) ? response.status : 'allowed';
      expect({ route: label(route), result: actual }).toEqual({
        route: label(route),
        result: expected,
      });
    }
  });

  it("US-USR-01-T08 another traveler's record answers exactly like a missing one", async () => {
    const owner = await travelerCookie();
    const intruder = await travelerCookie();
    for (const route of ROUTES.filter((candidate) => candidate.access === 'owner')) {
      const theirs = await call(route, intruder, await savedTravelerOf(owner));
      const missing = await call(route, intruder);
      expect({ route: label(route), status: theirs.status }).toEqual({
        route: label(route),
        status: 404,
      });
      expect({ ...theirs.body, requestId: null }).toEqual({ ...missing.body, requestId: null });
    }
  });

  it('US-USR-01-T09 an administrator reaches admin routes', async () => {
    const cookie = await adminCookie();
    for (const route of ROUTES.filter((candidate) => candidate.access === 'admin')) {
      const response = await call(route, cookie);
      expect({ route: label(route), denied: [401, 403].includes(response.status) }).toEqual({
        route: label(route),
        denied: false,
      });
    }
  });

  it('NFR-SEC-02-T01 the list above covers every route the app serves', () => {
    const express = app.getHttpAdapter().getInstance() as {
      router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
    };
    const served = express.router.stack
      .filter((layer) => layer.route && !layer.route.path.includes('*'))
      .flatMap((layer) =>
        Object.keys(layer.route!.methods).map((method) => `${method} ${layer.route!.path}`),
      )
      .sort();
    const listed = ROUTES.map((route) => `${route.method} ${route.path}`).sort();
    expect(served).toEqual(listed);
  });
});
