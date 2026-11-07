export enum UserRole {
  Traveler = 'TRAVELER',
  Admin = 'ADMIN',
}

/** The signed-in user, as every other module sees them. */
export interface Principal {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export const LOCKOUT_FAILURES = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * When sign-in for an email unlocks, given its recent failures in time order, or null when it is
 * not locked. Five failures within 15 minutes lock it for 15 minutes from the fifth (US-USR-05
 * AC-3).
 */
export function lockedUntil(failures: readonly Date[]): Date | null {
  let until: Date | null = null;
  for (let first = 0; first + LOCKOUT_FAILURES - 1 < failures.length; first += 1) {
    const fifth = failures[first + LOCKOUT_FAILURES - 1];
    if (fifth.getTime() - failures[first].getTime() <= LOCKOUT_WINDOW_MS) {
      until = new Date(fifth.getTime() + LOCKOUT_DURATION_MS);
    }
  }
  return until;
}

/** Emails are compared lower-case: Ali@x.com and ali@x.com are the same mailbox. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const MIN_PASSWORD_LENGTH = 10;
// bcrypt ignores everything past 72 bytes; the same cap keeps the rule portable (S1 section 3.2).
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
