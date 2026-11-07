import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../shared/errors';
import type { RequestWithPrincipal } from './access';
import { USERS_API, type UsersApi } from './users-api';

export const SESSION_COOKIE = 'flight_session';
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

/** Reads the session token from the Cookie header, without a cookie-parsing dependency. */
export function sessionTokenFrom(cookieHeader: string | undefined): string | undefined {
  for (const part of cookieHeader?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-requested-with';

/**
 * CSRF protection (NFR-SEC-04): every state-changing request must carry X-Requested-With. A
 * cross-site form cannot set a custom header, and a cross-origin script cannot send one without a
 * CORS preflight this API never approves. The web app reaches the API through its own /api/*
 * origin and sets the header on every request.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    if (!SAFE_METHODS.has(request.method) && !request.headers[CSRF_HEADER]) {
      throw AppError.forbidden('CSRF_CHECK_FAILED', 'Cross-site requests are not allowed.');
    }
    next();
  }
}

/**
 * The coarse step: resolves who is signed in, once per request, from the server-side session.
 * It never rejects anything; the decorators around each use case decide (S1 section 7.2). While
 * the session is in use, the cookie is renewed so it lives as long as the session does.
 */
@Injectable()
export class PrincipalMiddleware implements NestMiddleware {
  constructor(@Inject(USERS_API) private readonly users: UsersApi) {}

  async use(request: RequestWithPrincipal, response: Response, next: NextFunction): Promise<void> {
    const token = sessionTokenFrom(request.headers.cookie);
    request.principal = await this.users.currentUser(token);
    if (token && request.principal) {
      response.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
    }
    next();
  }
}
