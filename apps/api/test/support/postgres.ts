import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource, type MigrationInterface } from 'typeorm';
import { baseDatabaseOptions } from '../../src/database/database.options';

/** Keep in step with docker-compose.yml. */
export const POSTGRES_IMAGE = 'postgres:18-alpine';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'src', 'database', 'migrations');

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  url: string;
  stop(): Promise<void>;
}

/**
 * Starts a throwaway PostgreSQL container and applies all migrations to it.
 * Call in beforeAll() and call stop() in afterAll().
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const url = container.getConnectionUri();

  const dataSource = new DataSource({
    ...baseDatabaseOptions(url),
    migrations: await loadMigrationClasses(),
  });
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }

  return {
    container,
    url,
    stop: async () => {
      await container.stop();
    },
  };
}

/**
 * Loads the migration source files through Vitest, which compiles TypeScript.
 * TypeORM's own glob loading would hand the .ts files to Node directly, which cannot run them.
 */
async function loadMigrationClasses(): Promise<MigrationClass[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .sort();

  const classes: MigrationClass[] = [];
  for (const file of files) {
    const exports = (await import(join(MIGRATIONS_DIR, file))) as Record<string, unknown>;
    for (const value of Object.values(exports)) {
      if (typeof value === 'function') {
        classes.push(value as MigrationClass);
      }
    }
  }
  return classes;
}

type MigrationClass = new () => MigrationInterface;
