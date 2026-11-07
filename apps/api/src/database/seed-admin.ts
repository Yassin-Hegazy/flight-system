import type { INestApplicationContext } from '@nestjs/common';
import { USERS_API, type UsersApi } from '../modules/users-access/index';

export interface AdminSeed {
  email: string;
  password: string;
  name: string;
}

export type SeedOutcome = 'created' | 'already-exists';

/**
 * Creates the first administrator, the only way one can exist before any administrator does
 * (US-USR-04 AC-3). Running it again for the same email changes nothing.
 */
export async function seedAdmin(
  app: INestApplicationContext,
  admin: AdminSeed,
): Promise<SeedOutcome> {
  const users = app.get<UsersApi>(USERS_API);
  const result = await users.createAdmin(admin);
  if (result.ok) return 'created';
  if (result.error === 'EMAIL_TAKEN') return 'already-exists';
  throw new Error('The administrator password must be at least 10 characters and at most 72 bytes');
}
