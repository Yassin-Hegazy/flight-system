/**
 * Command-line entry point for demo data: administrator, demo traveler and two weeks of flights.
 * Run by `pnpm bootstrap`, or directly with `node dist/database/seed-demo.main.js`.
 *
 * Optional environment (apps/api/.env or the shell): ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME,
 * DEMO_TRAVELER_EMAIL, DEMO_TRAVELER_PASSWORD. The built-in defaults are for local development
 * only, so a production environment must supply its own passwords.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { seedDemo } from './seed-demo';

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
    const { flights } = summary;
    console.log(`Administrator ${admin.email}: ${summary.admin}.`);
    console.log(`Demo traveler ${traveler.email}: ${summary.traveler}.`);
    console.log(`Flights: ${flights.created} created, ${flights.existing} already there.`);
    if (flights.rejected.length > 0) {
      const first = flights.rejected[0];
      throw new Error(
        `The Catalog refused ${flights.rejected.length} demo flights, e.g. ${first.flightNumber} on ${first.departure}: ${first.reason}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
