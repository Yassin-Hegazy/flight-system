import type { ValidationError } from '@nestjs/common';

export type FieldErrors = Record<string, string>;

export interface ErrorBody {
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
  requestId: string;
}

export class AppError extends Error {
  static notFound(code: string, message: string): AppError {
    void code;
    void message;
    throw new Error('Not implemented');
  }

  static badRequest(code: string, message: string, fieldErrors?: FieldErrors): AppError {
    void code;
    void message;
    void fieldErrors;
    throw new Error('Not implemented');
  }
}

export function toErrorResponse(
  exception: unknown,
  requestId: string,
): { status: number; body: ErrorBody } {
  void exception;
  void requestId;
  throw new Error('Not implemented');
}

export function fieldErrorsFrom(errors: ValidationError[]): FieldErrors {
  void errors;
  throw new Error('Not implemented');
}
