import type { DataSourceOptions } from 'typeorm';

/** Connection options shared by the Nest application, the TypeORM CLI and the test helpers. */
export function baseDatabaseOptions(url: string) {
  return {
    type: 'postgres',
    url,
    // The schema is changed only through migrations, which the application never runs itself.
    synchronize: false,
    migrationsRun: false,
    // UUID primary keys default to gen_random_uuid(), built into PostgreSQL 13+, so generated
    // migrations need no uuid-ossp extension.
    uuidExtension: 'pgcrypto',
  } satisfies DataSourceOptions;
}
