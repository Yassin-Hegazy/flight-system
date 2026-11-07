import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

describe('NFR-ERR-01 error shape over HTTP', () => {
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

  it('NFR-ERR-01-T06 an unknown route is a 404 carrying the request ID from the header', async () => {
    const response = await request(app.getHttpServer()).get('/no-such-route').expect(404);

    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String),
      requestId: response.headers['x-request-id'],
    });
  });

  it('NFR-ERR-01-T07 a malformed JSON body is a 400, never a 500', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('content-type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(response.body.code).toBe('BAD_REQUEST');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });
});
