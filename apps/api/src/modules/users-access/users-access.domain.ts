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

const MIN_PASSWORD_LENGTH = 10;
// bcrypt-style limit kept for portability: anything past 72 bytes would be ignored by bcrypt.
const MAX_PASSWORD_BYTES = 72;

/** Why a password is unacceptable, or null when it is fine (US-USR-04 AC-1). */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password must not exceed ${MAX_PASSWORD_BYTES} bytes`;
  }
  return null;
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
