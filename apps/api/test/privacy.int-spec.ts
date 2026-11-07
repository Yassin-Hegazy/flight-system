import fs from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

const PASSWORD = 'a very private password';
const BIRTH_DATE = '1987-04-23';

/**
 * NFR-PRIV-01 / NFR-SEC-01: passwords, password hashes and birth dates never reach the logs or a
 * response. Logging runs at info level here and its output is captured from the file descriptors
 * pino writes to.
 */
describe('NFR-PRIV-01 sensitive data stays out of logs and responses', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  const logged: string[] = [];
  const realWriteSync = fs.writeSync;
  const realWrite = fs.write;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'info';
    const capture = (fd: unknown, data: unknown) => {
      if ((fd === 1 || fd === 2) && (typeof data === 'string' || Buffer.isBuffer(data))) {
        logged.push(data.toString());
      }
    };
    fs.writeSync = (fd: number, data: unknown, ...rest: unknown[]) => {
      capture(fd, data);
      return (realWriteSync as (...args: unknown[]) => number)(fd, data, ...rest);
    };
    fs.write = ((fd: number, data: unknown, ...rest: unknown[]) => {
      capture(fd, data);
      return (realWrite as (...args: unknown[]) => void)(fd, data, ...rest);
    }) as typeof fs.write;

    database = await startTestDatabase();
    app = await createTestApp(database.url);
  });

  afterAll(async () => {
    fs.writeSync = realWriteSync;
    fs.write = realWrite;
    await app?.close();
    await database?.stop();
  });

  it('NFR-PRIV-01-T01 the booking-adjacent flow logs requests but no password, hash or birth date', async () => {
    const server = () => request(app.getHttpServer());
    const email = 'private.person@example.com';
    const responses = [];

    responses.push(
      await server()
        .post('/users/register')
        .set('x-requested-with', 'fetch')
        .send({ email, password: PASSWORD, name: 'Private Person' })
        .expect(201),
    );
    const signIn = await server()
      .post('/users/sign-in')
      .set('x-requested-with', 'fetch')
      .send({ email, password: PASSWORD })
      .expect(200);
    responses.push(signIn);
    const cookie = (signIn.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    responses.push(
      await server()
        .post('/users/me/saved-travelers')
        .set('x-requested-with', 'fetch')
        .set('cookie', cookie)
        .send({ name: 'My Child', dateOfBirth: BIRTH_DATE })
        .expect(201),
    );
    responses.push(await server().get('/users/me').set('cookie', cookie).expect(200));
    await server().post('/users/sign-in').set('x-requested-with', 'fetch').send({
      email,
      password: 'a wrong password',
    });

    const logs = logged.join('\n');
    expect(logs).toContain('/users/sign-in'); // the capture really sees the request log lines
    expect(logs).not.toContain(PASSWORD);
    expect(logs).not.toContain('a wrong password');
    expect(logs).not.toContain('$argon2');
    expect(logs).not.toContain(BIRTH_DATE);
    expect(logs).not.toContain(cookie.split('=')[1]);

    for (const response of responses) {
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('passwordHash');
      expect(body).not.toContain('$argon2');
      expect(body).not.toContain(PASSWORD);
    }
  });
});
