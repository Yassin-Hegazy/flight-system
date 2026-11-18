/**
 * Command-line entry point for demo data: administrator, demo traveler and two weeks of flights.
 * Run by `pnpm bootstrap`, or directly with `node dist/database/seed-demo.main.js`.
 *
 * Optional environment (apps/api/.env or the shell): ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME,
 * DEMO_TRAVELER_EMAIL, DEMO_TRAVELER_PASSWORD, SEED_DEMO_ACCOUNTS (the ten accounts in
 * seed-accounts.ts: on by default, off in production unless set to true), and SEED_WORLD=false to skip the world network
 * (about 50,000 flights over 1,168 airports, src/database/world). The built-in defaults are for local development
 * only, so a production environment must supply its own passwords.
 */
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { seedAccounts, shouldSeedAccounts } from './seed-accounts';
import { seedDemo, type FlightSeedResult } from './seed-demo';
import { seedWorld } from './world/seed-world';

const LOCAL_DEFAULTS = {
  adminEmail: 'admin@example.com',
  adminPassword: 'Admin-Local-2026!',
  travelerEmail: 'traveler@example.com',
  travelerPassword: 'Traveler-Local-2026!',
};

async function main(): Promise<void> {
  const env = process.env;
  const production = env.NODE_ENV === 'production';
  if (production && (!env.ADMIN_PASSWORD || !env.DEMO_TRAVELER_PASSWORD)) {
    throw new Error(
      'In production, set ADMIN_PASSWORD and DEMO_TRAVELER_PASSWORD: the defaults are public.',
    );
  }

  const admin = {
    email: env.ADMIN_EMAIL ?? LOCAL_DEFAULTS.adminEmail,
    password: env.ADMIN_PASSWORD ?? LOCAL_DEFAULTS.adminPassword,
    name: env.ADMIN_NAME ?? 'Administrator',
  };
  const traveler = {
    email: env.DEMO_TRAVELER_EMAIL ?? LOCAL_DEFAULTS.travelerEmail,
    password: env.DEMO_TRAVELER_PASSWORD ?? LOCAL_DEFAULTS.travelerPassword,
    name: 'Demo Traveler',
  };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const summary = await seedDemo(app, { admin, traveler });
    console.log(`Administrator ${admin.email}: ${summary.admin}.`);
    console.log(`Demo traveler ${traveler.email}: ${summary.traveler}.`);
    report('Demo flights', summary.flights);

    await seedDemoAccounts(app, env);

    if (env.SEED_WORLD !== 'false') {
      const started = Date.now();
      const world = await seedWorld(app, {
        onProgress: (done, total) => process.stdout.write(`\rWorld network: ${done}/${total}`),
      });
      process.stdout.write('\n');
      console.log(
        `Airports: ${world.airports.created} created, ${world.airports.existing} already there.`,
      );
      report('World flights', world.flights);
      console.log(`World network seeded in ${Math.round((Date.now() - started) / 1000)} s.`);
    }
  } finally {
    await app.close();
  }
}

/** The ten demo accounts, unless this is production and they were not asked for. */
async function seedDemoAccounts(
  app: INestApplicationContext,
  env: Record<string, string | undefined>,
): Promise<void> {
  if (!shouldSeedAccounts(env)) {
    console.log('Demo accounts skipped (production; set SEED_DEMO_ACCOUNTS=true to add them).');
    return;
  }
  for (const { account, outcome } of await seedAccounts(app)) {
    console.log(`${account.role.padEnd(8)} ${account.email} / ${account.password}: ${outcome}.`);
  }
}

function report(label: string, flights: FlightSeedResult): void {
  console.log(`${label}: ${flights.created} created, ${flights.existing} already there.`);
  if (flights.rejected.length > 0) {
    const first = flights.rejected[0];
    throw new Error(
      `The Catalog refused ${flights.rejected.length} ${label.toLowerCase()}, e.g. ${first.flightNumber} on ${first.departure}: ${first.reason}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
