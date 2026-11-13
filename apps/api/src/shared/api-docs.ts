import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiResponse } from '@nestjs/swagger';
import type { ErrorBody, ExpectedStatus } from './errors';

/** The session cookie's name, as Swagger's cookie authentication scheme. */
export const SESSION_COOKIE_SCHEME = 'flight_session';

/** The one error shape every route answers with (NFR-ERR-01), as an OpenAPI schema. */
export class ErrorResponse implements ErrorBody {
  @ApiProperty({ example: 'VALIDATION_FAILED', description: 'Stable, machine-readable code.' })
  code!: string;

  @ApiProperty({ example: 'The request is invalid.', description: 'For people; may change.' })
  message!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { date: 'date must be a real calendar date written as YYYY-MM-DD' },
    description: 'One message per invalid field, keyed by its path.',
  })
  fieldErrors?: Record<string, string>;

  @ApiProperty({
    example: '0f1c2d3e-4b5a-4c6d-8e7f-8091a2b3c4d5',
    description: 'Matches the X-Request-Id header and the server log line.',
  })
  requestId!: string;
}

const MEANING: Record<ExpectedStatus, string> = {
  400: 'Invalid input; fieldErrors names each invalid field.',
  401: 'Not signed in, or the session expired.',
  403: 'Signed in, but this role may not do this.',
  404: 'Not found, or not yours: both answer the same.',
  409: "Conflicts with the resource's current state.",
};

/** Documents the expected errors of a route, each with the shared error shape. */
export function ApiErrors(...statuses: ExpectedStatus[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: MEANING[status], type: ErrorResponse }),
    ),
  );
}

/** A route that needs a session: documents the cookie and the 401. */
export function ApiSession(...otherErrors: Exclude<ExpectedStatus, 401>[]) {
  return applyDecorators(ApiCookieAuth(SESSION_COOKIE_SCHEME), ApiErrors(401, ...otherErrors));
}
