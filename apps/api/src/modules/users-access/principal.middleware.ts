import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { RequestWithPrincipal } from './access';
import { USERS_API, type UsersApi } from './users-api';

export const SESSION_COOKIE = 'flight_session';

/** Reads the session token from the Cookie header, without a cookie-parsing dependency. */
export function sessionTokenFrom(cookieHeader: string | undefined): string | undefined {
  for (const part of cookieHeader?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/**
 * The coarse step: resolves who is signed in, once per request, from the server-side session.
 * It never rejects anything; the decorators around each use case decide (S1 section 7.2).
 */
@Injectable()
export class PrincipalMiddleware implements NestMiddleware {
  constructor(@Inject(USERS_API) private readonly users: UsersApi) {}

  async use(request: RequestWithPrincipal, _response: Response, next: NextFunction): Promise<void> {
    request.principal = await this.users.currentUser(sessionTokenFrom(request.headers.cookie));
    next();
  }
}
