import type { INestApplicationContext } from '@nestjs/common';

export interface AdminSeed {
  email: string;
  password: string;
  name: string;
}

export type SeedOutcome = 'created' | 'already-exists';

/** Creates the first administrator (US-USR-04 AC-3). Not implemented yet. */
export function seedAdmin(app: INestApplicationContext, admin: AdminSeed): Promise<SeedOutcome> {
  void app;
  void admin;
  return Promise.reject(new Error('Not implemented'));
}
