/**
 * Command-line entry point: pnpm db:seed:admin, with ADMIN_EMAIL, ADMIN_PASSWORD and optionally
 * ADMIN_NAME set (in apps/api/.env or the environment).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { seedAdmin } from './seed-admin';

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD to seed the first administrator.');
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const outcome = await seedAdmin(app, {
      email,
      password,
      name: process.env.ADMIN_NAME ?? 'Administrator',
    });
    console.log(
      outcome === 'created'
        ? `Administrator ${email} created.`
        : `An account with ${email} already exists; nothing changed.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
