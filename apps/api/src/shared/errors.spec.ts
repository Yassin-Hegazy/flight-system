import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  type ValidationError,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppError, fieldErrorsFrom, toErrorResponse } from './errors';

const REQUEST_ID = 'req-123';

describe('NFR-ERR-01 one error shape for every API error', () => {
  it('NFR-ERR-01-T01 maps an expected application error to its status and the shared shape', () => {
    const error = AppError.notFound('FLIGHT_NOT_FOUND', 'Flight not found');
    expect(toErrorResponse(error, REQUEST_ID)).toEqual({
      status: 404,
      body: { code: 'FLIGHT_NOT_FOUND', message: 'Flight not found', requestId: REQUEST_ID },
    });
  });

  it('NFR-ERR-01-T02 carries per-field errors when there are any', () => {
    const error = AppError.badRequest('VALIDATION_ERROR', 'Some fields are invalid', {
      email: 'Email address is invalid',
    });
    expect(toErrorResponse(error, REQUEST_ID).body.fieldErrors).toEqual({
      email: 'Email address is invalid',
    });
  });

  it('NFR-ERR-01-T03 maps framework HTTP exceptions to the same shape', () => {
    expect(toErrorResponse(new NotFoundException('Cannot GET /nowhere'), REQUEST_ID)).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Cannot GET /nowhere', requestId: REQUEST_ID },
    });
    expect(toErrorResponse(new UnauthorizedException(), REQUEST_ID).body.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(toErrorResponse(new BadRequestException('Validation failed'), REQUEST_ID).status).toBe(
      400,
    );
  });

  it('NFR-ERR-01-T04 turns anything unexpected into a generic 500 with no internals', () => {
    const crash = new Error('relation "flights" does not exist at /app/src/x.ts:12');
    const { status, body } = toErrorResponse(crash, REQUEST_ID);
    expect(status).toBe(500);
    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: REQUEST_ID,
    });
    expect(JSON.stringify(body)).not.toContain('flights');
  });

  it('NFR-ERR-01-T05 maps a malformed JSON body to a 400', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    expect(toErrorResponse(parseError, REQUEST_ID)).toEqual({
      status: 400,
      body: {
        code: 'MALFORMED_BODY',
        message: 'The request body is not valid JSON.',
        requestId: REQUEST_ID,
      },
    });
  });

  it('NFR-SEC-03-T01 flattens validator errors into field paths with one message each', () => {
    const errors = [
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email', isString: 'email must be a string' },
        children: [],
      },
      {
        property: 'fares',
        children: [
          {
            property: 'ECONOMY',
            constraints: { min: 'ECONOMY must not be less than 1' },
            children: [],
          },
        ],
      },
    ] as unknown as ValidationError[];
    expect(fieldErrorsFrom(errors)).toEqual({
      email: 'email must be an email',
      'fares.ECONOMY': 'ECONOMY must not be less than 1',
    });
  });
});
