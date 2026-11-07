export enum UserRole {
  Traveler = 'TRAVELER',
  Admin = 'ADMIN',
}

export interface Principal {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must not exceed 72 bytes';
  return null;
}

export function fieldErrors(input: {
  name?: string;
  phone?: string;
  email?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.name !== undefined && (input.name.trim().length < 2 || input.name.length > 120)) {
    errors.name = 'Name must be between 2 and 120 characters';
  }
  if (input.phone !== undefined && !/^[+0-9 ()-]{7,30}$/.test(input.phone)) {
    errors.phone = 'Phone number is invalid';
  }
  if (input.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    errors.email = 'Email address is invalid';
  }
  return errors;
}

export interface OwnershipLoader<T> {
  (id: string): Promise<{ ownerId: string; value: T } | null>;
}

export function withAuth<TArgs extends unknown[], TResult>(
  useCase: (principal: Principal, ...args: TArgs) => Promise<TResult>,
  principal: Principal | null,
) {
  return (...args: TArgs): Promise<TResult> => {
    if (!principal) throw new Error('UNAUTHENTICATED');
    return useCase(principal, ...args);
  };
}

export function withRole<TArgs extends unknown[], TResult>(
  role: UserRole,
  useCase: (principal: Principal, ...args: TArgs) => Promise<TResult>,
  principal: Principal,
) {
  return (...args: TArgs): Promise<TResult> => {
    if (principal.role !== role) throw new Error('FORBIDDEN');
    return useCase(principal, ...args);
  };
}

export function withOwnership<T, TArgs extends unknown[], TResult>(
  loader: OwnershipLoader<T>,
  useCase: (principal: Principal, value: T, ...args: TArgs) => Promise<TResult>,
  principal: Principal,
) {
  return async (id: string, ...args: TArgs): Promise<TResult> => {
    const record = await loader(id);
    if (!record || record.ownerId !== principal.id) throw new Error('NOT_FOUND');
    return useCase(principal, record.value, ...args);
  };
}
