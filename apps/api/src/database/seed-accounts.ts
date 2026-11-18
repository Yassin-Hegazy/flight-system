import type { INestApplicationContext } from '@nestjs/common';
import { USERS_API, type UsersApi } from '../modules/users-access/index';
import type { SeedOutcome } from './seed-admin';

export interface DemoAccount {
  role: 'TRAVELER' | 'ADMIN';
  name: string;
  email: string;
  password: string;
}

/**
 * Ten accounts for trying the site: five travelers and five administrators. The passwords are
 * public (they are in this file and the README), so they are for local development and demos only.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'TRAVELER',
    name: 'Nour Hassan',
    email: 'nour@example.com',
    password: 'Nour-Travels-2026',
  },
  {
    role: 'TRAVELER',
    name: 'Omar Khaled',
    email: 'omar@example.com',
    password: 'Omar-Travels-2026',
  },
  {
    role: 'TRAVELER',
    name: 'Salma Youssef',
    email: 'salma@example.com',
    password: 'Salma-Travels-2026',
  },
  {
    role: 'TRAVELER',
    name: 'Karim Mostafa',
    email: 'karim@example.com',
    password: 'Karim-Travels-2026',
  },
  {
    role: 'TRAVELER',
    name: 'Laila Mahmoud',
    email: 'laila@example.com',
    password: 'Laila-Travels-2026',
  },
  {
    role: 'ADMIN',
    name: 'Mona Adel',
    email: 'mona.admin@example.com',
    password: 'Mona-Admin-2026!',
  },
  {
    role: 'ADMIN',
    name: 'Hany Fawzy',
    email: 'hany.admin@example.com',
    password: 'Hany-Admin-2026!',
  },
  {
    role: 'ADMIN',
    name: 'Rana Samir',
    email: 'rana.admin@example.com',
    password: 'Rana-Admin-2026!',
  },
  {
    role: 'ADMIN',
    name: 'Tarek Nabil',
    email: 'tarek.admin@example.com',
    password: 'Tarek-Admin-2026!',
  },
  {
    role: 'ADMIN',
    name: 'Dina Fathy',
    email: 'dina.admin@example.com',
    password: 'Dina-Admin-2026!',
  },
];

/**
 * Seeded by default, except in production, where the public passwords would let anyone sign in
 * as an administrator: there they need SEED_DEMO_ACCOUNTS=true. SEED_DEMO_ACCOUNTS=false skips them
 * anywhere.
 */
export function shouldSeedAccounts(env: Record<string, string | undefined>): boolean {
  if (env.SEED_DEMO_ACCOUNTS) return env.SEED_DEMO_ACCOUNTS === 'true';
  return env.NODE_ENV !== 'production';
}

/** Registers each account through Users and Access; an email already taken is left as it is. */
export async function seedAccounts(
  app: INestApplicationContext,
  accounts: readonly DemoAccount[] = DEMO_ACCOUNTS,
): Promise<{ account: DemoAccount; outcome: SeedOutcome }[]> {
  const users = app.get<UsersApi>(USERS_API);
  const results: { account: DemoAccount; outcome: SeedOutcome }[] = [];
  for (const account of accounts) {
    const { name, email, password } = account;
    const input = { name, email, password };
    const result =
      account.role === 'ADMIN' ? await users.createAdmin(input) : await users.register(input);
    if (!result.ok && result.error !== 'EMAIL_TAKEN') {
      throw new Error(`The demo account ${email} has a password the app refuses`);
    }
    results.push({ account, outcome: result.ok ? 'created' : 'already-exists' });
  }
  return results;
}
