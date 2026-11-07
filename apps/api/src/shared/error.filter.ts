import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { toErrorResponse } from './errors';

const REQUEST_ID_HEADER = 'x-request-id';

/** Sends every error in the shared shape and logs unexpected ones with their request ID. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();

    const requestId = requestIdOf(request, response);
    const { status, body } = toErrorResponse(exception, requestId);

    if (status === 500) {
      // Name, message and stack only: driver errors also carry query parameters, which can hold
      // personal data (NFR-PRIV-01).
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        { requestId, err: { name: error.name, message: error.message, stack: error.stack } },
        'Unhandled error',
      );
    }

    response.status(status).json(body);
  }
}

function requestIdOf(request: Request & { id?: unknown }, response: Response): string {
  const fromHeader = response.getHeader(REQUEST_ID_HEADER);
  if (typeof fromHeader === 'string') return fromHeader;
  if (typeof request.id === 'string') return request.id;
  const generated = randomUUID();
  response.setHeader(REQUEST_ID_HEADER, generated);
  return generated;
}
