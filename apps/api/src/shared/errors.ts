import { HttpException, type ValidationError } from '@nestjs/common';

/**
 * One JSON shape for every API error (NFR-ERR-01). Expected errors map to 400, 401, 403, 404 or
 * 409; anything else is a 500 with a generic message and no stack trace, SQL or file path.
 */
export type FieldErrors = Record<string, string>;

export interface ErrorBody {
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
  requestId: string;
}

export type ExpectedStatus = 400 | 401 | 403 | 404 | 409;

export class AppError extends Error {
  constructor(
    readonly status: ExpectedStatus,
    readonly code: string,
    message: string,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(code: string, message: string, fieldErrors?: FieldErrors): AppError {
    return new AppError(400, code, message, fieldErrors);
  }

  static unauthenticated(code = 'UNAUTHENTICATED', message = 'Sign in required.'): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(code = 'FORBIDDEN', message = 'You are not allowed to do this.'): AppError {
    return new AppError(403, code, message);
  }

  static notFound(code: string, message: string): AppError {
    return new AppError(404, code, message);
  }

  static conflict(code: string, message: string, fieldErrors?: FieldErrors): AppError {
    return new AppError(409, code, message, fieldErrors);
  }
}

/** A 400 listing the invalid fields, used by the global validation pipe. */
export function validationError(fieldErrors: FieldErrors): AppError {
  return AppError.badRequest('VALIDATION_ERROR', 'Some fields are invalid.', fieldErrors);
}

/** Flattens class-validator errors into `path: first message`, e.g. `fares.ECONOMY`. */
export function fieldErrorsFrom(errors: ValidationError[], prefix = ''): FieldErrors {
  const result: FieldErrors = {};
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const first = error.constraints ? Object.values(error.constraints)[0] : undefined;
    if (first) result[path] = first;
    if (error.children?.length) Object.assign(result, fieldErrorsFrom(error.children, path));
  }
  return result;
}

const CODE_FOR_STATUS: Record<ExpectedStatus, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

const GENERIC_500: Omit<ErrorBody, 'requestId'> = {
  code: 'INTERNAL_ERROR',
  message: 'An unexpected error occurred.',
};

function asExpected(status: number): ExpectedStatus | null {
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 409
    ? status
    : null;
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = response.message;
    if (typeof message === 'string') return message;
  }
  return exception.message;
}

/** A raw body-parser failure (malformed JSON, oversized payload) that reached the filter. */
function isBodyParserError(exception: unknown): exception is { status: number; type: string } {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'type' in exception &&
    'status' in exception &&
    typeof exception.status === 'number' &&
    exception.status >= 400 &&
    exception.status < 500
  );
}

/** Pure mapping from anything thrown to the status and body sent to the client. */
export function toErrorResponse(
  exception: unknown,
  requestId: string,
): { status: number; body: ErrorBody } {
  if (exception instanceof AppError) {
    const body: ErrorBody = { code: exception.code, message: exception.message, requestId };
    if (exception.fieldErrors) body.fieldErrors = exception.fieldErrors;
    return { status: exception.status, body };
  }
  if (exception instanceof HttpException) {
    const status = asExpected(exception.getStatus());
    if (status) {
      return {
        status,
        body: { code: CODE_FOR_STATUS[status], message: messageOf(exception), requestId },
      };
    }
  }
  if (isBodyParserError(exception)) {
    return exception.type === 'entity.parse.failed'
      ? {
          status: 400,
          body: {
            code: 'MALFORMED_BODY',
            message: 'The request body is not valid JSON.',
            requestId,
          },
        }
      : {
          status: 400,
          body: { code: 'BAD_REQUEST', message: 'The request was rejected.', requestId },
        };
  }
  return { status: 500, body: { ...GENERIC_500, requestId } };
}
