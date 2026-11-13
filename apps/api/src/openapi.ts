import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { OPENAPI_EXAMPLES } from './openapi-examples';
import { SESSION_COOKIE_SCHEME } from './shared/api-docs';

const DESCRIPTION = `Flight search, booking and ticketing.

**Signing in.** Run \`POST /users/sign-in\` here with "Try it out". The browser keeps the
HttpOnly session cookie and sends it with every later call from this page. After \`pnpm bootstrap\`
the demo accounts are \`traveler@example.com\` / \`Traveler-Local-2026!\` and
\`admin@example.com\` / \`Admin-Local-2026!\`.

**CSRF.** Every state-changing request needs an \`X-Requested-With\` header; this page adds it.
Without it the API answers 403 \`CSRF_CHECK_FAILED\`.

**Conventions.** Money is an integer count of minor units plus a currency (\`1500000\` EGP is
15,000.00 EGP). Instants are UTC ISO-8601; local times carry their offset
(\`2026-12-10T09:00+02:00\`). Every error has the same shape: \`code\`, \`message\`, optional
\`fieldErrors\` and \`requestId\`.

**Mock payment tokens.** \`tok_success\`, \`tok_declined\`, \`tok_timeout\` (stays pending until the
recovery job resolves it).`;

const TAGS: [string, string][] = [
  ['Health', 'Liveness and database connectivity.'],
  ['Users and Access', 'Accounts, sessions, profile and saved travelers.'],
  ['Flight Catalog', 'Flights, airports and schedules as reference data.'],
  ['Search', 'One-way and round-trip search with sorting, filters and paging.'],
  ['Booking', 'Reserve a seat, read and cancel a booking.'],
  ['Payments', 'Pay with a mock token; receipts and refunds.'],
  ['Ticketing', 'One ticket per passenger per flight, issued after payment.'],
  ['Notifications', 'The in-app inbox and email preferences.'],
  ['Administration', 'Flights, capacity, fares, airports, manifest and the audit trail.'],
];

/** The OpenAPI document served at /docs, with a real response body as each route's example. */
export function openApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Flight Booking API')
    .setDescription(DESCRIPTION)
    .setVersion('0.1.0')
    // Cookie name, then the scheme's options, then the scheme's own name, which routes reference.
    .addCookieAuth(
      SESSION_COOKIE_SCHEME,
      { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE_SCHEME },
      SESSION_COOKIE_SCHEME,
    );
  for (const [name, description] of TAGS) builder.addTag(name, description);
  return withExamples(SwaggerModule.createDocument(app, builder.build()));
}

/** Examples are keyed "METHOD /path" then by status, as recorded from a run of the API. */
function withExamples(document: OpenAPIObject): OpenAPIObject {
  for (const [operation, byStatus] of Object.entries(OPENAPI_EXAMPLES)) {
    const [method, path] = operation.split(' ');
    const responses = document.paths[path]?.[method.toLowerCase() as 'get']?.responses;
    if (!responses) continue;
    for (const [status, example] of Object.entries(byStatus)) {
      const response = responses[status] as { content?: Record<string, object> } | undefined;
      if (!response || example === null) continue;
      const json = response.content?.['application/json'] ?? {};
      response.content = { 'application/json': { ...json, example } };
    }
  }
  return document;
}
