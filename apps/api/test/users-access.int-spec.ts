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
});
