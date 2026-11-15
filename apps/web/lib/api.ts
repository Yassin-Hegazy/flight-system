// One way to call the API from the browser: JSON over /api/* (rewritten to the NestJS API). The
// session is an HttpOnly cookie the browser sends by itself; nothing here reads or stores a token.

/** The API's shared error shape (NFR-ERR-01). */
export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

/** Any non-2xx answer. 401 means sign in; fieldErrors belong next to their fields. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }
}

const UNKNOWN: ApiErrorBody = {
  code: 'UNKNOWN',
  message: 'Something went wrong. Please try again.',
};

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/** Calls /api{path}. Every write carries X-Requested-With, which the API requires against CSRF. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (method !== 'GET') headers['x-requested-with'] = 'fetch';
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return body as T;
  throw new ApiError(response.status, isErrorBody(body) ? body : UNKNOWN);
}

/** The message to show for a failed call, whatever was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.body.message : UNKNOWN.message;
}

/** The per-field messages of a failed call, or none. */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  return error instanceof ApiError ? (error.body.fieldErrors ?? {}) : {};
}

/** A text field's value from a submitted form; "" when it is missing. */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
