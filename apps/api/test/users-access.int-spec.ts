import type { INestApplication } from '@nestjs/common';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  const http = () => request(app.getHttpServer());

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
});
