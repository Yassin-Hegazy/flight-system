import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';

/**
 * Boots the full AppModule against the given database.
 * The environment is set before AppModule is loaded, because ConfigModule validates it on import.
 */
export async function createTestApp(databaseUrl: string): Promise<INestApplication<App>> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.LOG_LEVEL ??= 'silent';

  const { AppModule } = await import('../../src/app.module.js');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}
