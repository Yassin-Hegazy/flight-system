import type { INestApplication } from '@nestjs/common';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAdmin } from '../src/database/seed-admin';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'correct horse battery';

describe('Users and Access over HTTP', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let emailCounter = 0;

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  /**
   * What the web app sends: state-changing requests carry X-Requested-With, which a cross-site
   * form cannot set (NFR-SEC-04).
   */
  const http = () => {
    const server = request(app.getHttpServer());
    return {
      get: (url: string) => server.get(url),
      post: (url: string) => server.post(url).set('x-requested-with', 'fetch'),
      patch: (url: string) => server.patch(url).set('x-requested-with', 'fetch'),
      delete: (url: string) => server.delete(url).set('x-requested-with', 'fetch'),
    };
  };

  /** A request as a cross-site form post would make it: no custom header. */
  const crossSite = () => request(app.getHttpServer());

  /** A fresh, unique email for each test, so tests do not depend on each other. */
  const newEmail = () => `traveler${++emailCounter}@example.com`;

  const register = (email: string, password = PASSWORD) =>
    http().post('/users/register').send({ email, password, name: 'Test Traveler' });

  const signIn = (email: string, password = PASSWORD) =>
    http().post('/users/sign-in').send({ email, password });

  /** Registers and signs in a new traveler; returns their email and session cookie. */
  async function signedInTraveler(): Promise<{ email: string; cookie: string }> {
    const email = newEmail();
    await register(email).expect(201);
    const response = await signIn(email).expect(200);
    return { email, cookie: sessionCookieOf(response).split(';')[0] };
  }

  const withoutRequestId = (body: unknown) => ({
    ...(body as Record<string, unknown>),
    requestId: undefined,
  });

  function sessionCookieOf(response: Response): string {
    const header = response.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = header?.find((value) => value.startsWith('flight_session='));
    if (!cookie) throw new Error('No session cookie was set');
    return cookie;
  }

  describe('US-USR-05 Sign in and sign out', () => {
    it('US-USR-05-T06 the session token travels only in an HttpOnly, SameSite cookie', async () => {
      const email = newEmail();
      await register(email);

      const response = await signIn(email);

      const cookie = sessionCookieOf(response);
      const token = cookie.split(';')[0].slice('flight_session='.length);
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax/i);
      expect(JSON.stringify(response.body)).not.toContain(token);
    });
  });

  describe('NFR-ERR-01 failures use real status codes and the shared error shape', () => {
    it('US-USR-05-T01 a wrong password and an unknown email get the same 401 body', async () => {
      const email = newEmail();
      await register(email).expect(201);

      const wrongPassword = await signIn(email, 'wrong password!').expect(401);
      const unknownEmail = await signIn(newEmail(), 'wrong password!').expect(401);

      expect(wrongPassword.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(withoutRequestId(wrongPassword.body)).toEqual(withoutRequestId(unknownEmail.body));
    });

    it('US-USR-04-T01 email unique ignoring case (409); password boundary 9 vs 10 characters', async () => {
      const email = newEmail();
      await register(email).expect(201);
      const duplicate = await register(email.toUpperCase()).expect(409);
      expect(duplicate.body.code).toBe('EMAIL_TAKEN');

      const nine = await register(newEmail(), '123456789').expect(400);
      expect(nine.body.fieldErrors).toHaveProperty('password');
      await register(newEmail(), '1234567890').expect(201);
    });

    it('US-USR-02-T01 profile errors are a 400 with one message per field', async () => {
      const { cookie } = await signedInTraveler();

      const badName = await http()
        .patch('/users/me')
        .set('cookie', cookie)
        .send({ name: 'A' })
        .expect(400);
      expect(badName.body.fieldErrors).toHaveProperty('name');

      const emailWithoutPassword = await http()
        .patch('/users/me')
        .set('cookie', cookie)
        .send({ email: newEmail() })
        .expect(400);
      expect(emailWithoutPassword.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        fieldErrors: { currentPassword: expect.any(String) },
      });
    });

    it('US-USR-07-T01 a wrong current password is a 400 on the current field', async () => {
      const { cookie } = await signedInTraveler();
      const response = await http()
        .patch('/users/me/password')
        .set('cookie', cookie)
        .send({ current: 'not my password', next: 'a brand new password' })
        .expect(400);
      expect(response.body.fieldErrors).toHaveProperty('current');
    });

    it('US-USR-06-T01 the 11th saved traveler is refused with 409; the 10th is accepted', async () => {
      const { cookie } = await signedInTraveler();
      for (let i = 1; i <= 10; i += 1) {
        await http()
          .post('/users/me/saved-travelers')
          .set('cookie', cookie)
          .send({ name: `Traveler ${i}`, dateOfBirth: '1990-01-01' })
          .expect(201);
      }
      const eleventh = await http()
        .post('/users/me/saved-travelers')
        .set('cookie', cookie)
        .send({ name: 'Traveler 11', dateOfBirth: '1990-01-01' })
        .expect(409);
      expect(eleventh.body.code).toBe('SAVED_TRAVELER_LIMIT');
    });
  });
  describe('US-USR-04 concurrent registration', () => {
    it('US-USR-04-T08 two simultaneous sign-ups for one mailbox: one 201, one 409, never a 500', async () => {
      const email = newEmail();
      const responses = await Promise.all([register(email), register(email.toUpperCase())]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    });
  });
  describe('US-USR-07 Change my password', () => {
    it('US-USR-07-T02 the session that changes the password stays; every other session is signed out', async () => {
      const { email, cookie: laptop } = await signedInTraveler();
      const phone = sessionCookieOf(await signIn(email).expect(200)).split(';')[0];

      await http()
        .patch('/users/me/password')
        .set('cookie', laptop)
        .send({ current: PASSWORD, next: 'a completely new password' })
        .expect(204);

      await http().get('/users/me').set('cookie', laptop).expect(200);
      await http().get('/users/me').set('cookie', phone).expect(401);
    });
  });
  describe('US-USR-03 / US-USR-04 administrators', () => {
    const ADMIN_EMAIL = 'first.admin@example.com';

    async function signedInAdmin(): Promise<string> {
      await seedAdmin(app, { email: ADMIN_EMAIL, password: PASSWORD, name: 'First Admin' });
      const response = await signIn(ADMIN_EMAIL).expect(200);
      expect(response.body.role).toBe('ADMIN');
      return sessionCookieOf(response).split(';')[0];
    }

    it('US-USR-04-T03 the seed script creates the first administrator, and running it again is harmless', async () => {
      const first = await seedAdmin(app, { email: ADMIN_EMAIL, password: PASSWORD, name: 'Admin' });
      const again = await seedAdmin(app, { email: ADMIN_EMAIL, password: PASSWORD, name: 'Admin' });
      expect([first, again]).toContain('already-exists');
      await signedInAdmin();
    });

    it('US-USR-04-T02 nobody can register as an administrator', async () => {
      const email = newEmail();
      const response = await http()
        .post('/users/register')
        .send({ email, password: PASSWORD, name: 'Sneaky', role: 'ADMIN' })
        .expect(400);
      expect(response.body.fieldErrors).toHaveProperty('role');
      await signIn(email).expect(401);
    });

    it('US-USR-04-T09 an administrator can create another administrator', async () => {
      const cookie = await signedInAdmin();
      const email = newEmail();
      await http()
        .post('/users/admins')
        .set('cookie', cookie)
        .send({ email, password: PASSWORD, name: 'Second Admin' })
        .expect(201);
      expect((await signIn(email).expect(200)).body.role).toBe('ADMIN');
    });

    it('US-USR-03-T01 a signed-in traveler is forbidden from administrative routes', async () => {
      const { cookie } = await signedInTraveler();
      const email = newEmail();
      const response = await http()
        .post('/users/admins')
        .set('cookie', cookie)
        .send({ email, password: PASSWORD, name: 'Nope' })
        .expect(403);
      expect(response.body.code).toBe('FORBIDDEN');
      await signIn(email).expect(401);
    });

    it('US-USR-03-T02 an anonymous request to an administrative route is unauthenticated', async () => {
      await http()
        .post('/users/admins')
        .send({ email: newEmail(), password: PASSWORD, name: 'Nope' })
        .expect(401);
    });

    it('US-USR-03-T03 a role sent by the client is ignored; the role comes from the session', async () => {
      const { cookie } = await signedInTraveler();
      await http()
        .post('/users/admins')
        .set('cookie', `${cookie}; role=ADMIN`)
        .set('x-user-role', 'ADMIN')
        .send({ email: newEmail(), password: PASSWORD, name: 'Nope', role: 'ADMIN' })
        .expect((response) => expect([400, 403]).toContain(response.status));
    });
  });
  describe('NFR-SEC-04 sessions and cross-site requests', () => {
    it('NFR-SEC-04-T02 a state-changing request without the custom header is refused', async () => {
      const { email, cookie } = await signedInTraveler();

      const signInAttempt = await crossSite()
        .post('/users/sign-in')
        .send({ email, password: PASSWORD })
        .expect(403);
      expect(signInAttempt.body.code).toBe('CSRF_CHECK_FAILED');

      await crossSite()
        .patch('/users/me')
        .set('cookie', cookie)
        .send({ name: 'Changed By Attacker' })
        .expect(403);
      expect((await http().get('/users/me').set('cookie', cookie).expect(200)).body.name).toBe(
        'Test Traveler',
      );
    });

    it('NFR-SEC-04-T03 reading needs no header', async () => {
      const { cookie } = await signedInTraveler();
      await crossSite().get('/users/me').set('cookie', cookie).expect(200);
    });

    it('NFR-SEC-04-T04 activity renews the cookie for another 24 hours, matching the server session', async () => {
      const { cookie } = await signedInTraveler();
      const response = await http().get('/users/me').set('cookie', cookie).expect(200);
      const renewed = sessionCookieOf(response);
      expect(renewed).toMatch(/Max-Age=86400/);
      expect(renewed).toMatch(/;\s*HttpOnly/i);
    });
  });
});
