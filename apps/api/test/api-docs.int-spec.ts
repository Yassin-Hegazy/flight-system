import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApiDocument } from '../src/openapi';
import { createTestApp } from './support/app';
import { startTestDatabase, type TestDatabase } from './support/postgres';

/** Routes anyone may call; every other route needs the session cookie. */
const PUBLIC = [
  'GET /health',
  'GET /flights',
  'GET /flights/airports/suggestions',
  'GET /flights/{id}',
  'GET /search/flights',
  'GET /search/round-trip',
  'POST /users/register',
  'POST /users/sign-in',
  'POST /users/sign-out',
];

interface Operation {
  summary?: string;
  tags?: string[];
  security?: Record<string, string[]>[];
  requestBody?: { content: Record<string, { schema?: { $ref?: string; properties?: object } }> };
  responses: Record<
    string,
    { content?: Record<string, { example?: unknown; schema?: { $ref?: string } }> }
  >;
}

describe('NFR-ERR-01 the API documentation at /docs', () => {
  let database: TestDatabase;
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    database = await startTestDatabase();
    app = await createTestApp(database.url);
    document = openApiDocument(app);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  const operations = () =>
    Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods as Record<string, Operation>).map(([method, operation]) => ({
        label: `${method.toUpperCase()} ${path}`,
        operation,
      })),
    );

  /** Each check lists the routes that fail it, so a failure names them. */
  const failing = (check: (operation: Operation, label: string) => boolean) =>
    operations()
      .filter(({ operation, label }) => !check(operation, label))
      .map(({ label }) => label);

  const schemaName = (ref?: string) => ref?.split('/').pop();
  const schemas = () =>
    (document.components?.schemas ?? {}) as Record<string, { properties?: object }>;

  it('NFR-ERR-01-T08 every route has a summary, one known tag, and a success response with an example', () => {
    const tags = new Set((document.tags ?? []).map(({ name }) => name));
    expect(failing((operation) => Boolean(operation.summary))).toEqual([]);
    expect(
      failing((operation) => operation.tags?.length === 1 && tags.has(operation.tags[0])),
    ).toEqual([]);
    expect(
      failing((operation) =>
        Object.entries(operation.responses).some(
          ([status, response]) =>
            status.startsWith('2') &&
            (status === '204' || response.content?.['application/json']?.example !== undefined),
        ),
      ),
    ).toEqual([]);
  });

  it('NFR-ERR-01-T09 every documented error uses the shared error shape', () => {
    expect(
      failing((operation) =>
        Object.entries(operation.responses)
          .filter(([status]) => status.startsWith('4'))
          .every(
            ([, response]) =>
              schemaName(response.content?.['application/json']?.schema?.$ref) === 'ErrorResponse',
          ),
      ),
    ).toEqual([]);
    expect(schemas().ErrorResponse?.properties).toHaveProperty('requestId');
  });

  it('NFR-ERR-01-T10 every route that needs a session declares the cookie and its 401; public ones do not', () => {
    const declaresSession = (operation: Operation) =>
      Boolean(operation.security?.some((scheme) => 'flight_session' in scheme)) &&
      '401' in operation.responses;
    expect(
      failing((operation, label) => PUBLIC.includes(label) || declaresSession(operation)),
    ).toEqual([]);
    expect(failing((operation, label) => !PUBLIC.includes(label) || !operation.security)).toEqual(
      [],
    );
    // The scheme the routes name must exist, or Swagger UI cannot send the cookie.
    expect(document.components?.securitySchemes?.flight_session).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'flight_session',
    });
  });

  it('NFR-ERR-01-T11 every request body is documented field by field', () => {
    expect(
      failing((operation) => {
        if (!operation.requestBody) return true;
        const schema = operation.requestBody.content['application/json']?.schema;
        const properties = schema?.$ref
          ? schemas()[schemaName(schema.$ref)!]?.properties
          : schema?.properties;
        return Object.keys(properties ?? {}).length > 0;
      }),
    ).toEqual([]);
  });
});
