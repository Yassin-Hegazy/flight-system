import type { DataSourceOptions } from 'typeorm';

/** Connection options shared by the Nest application, the TypeORM CLI and the test helpers. */
export function baseDatabaseOptions(url: string) {
  return {
    type: 'postgres',
    url,
    // The schema is changed only through migrations, which the application never runs itself.
    synchronize: false,
    migrationsRun: false,
  } satisfies DataSourceOptions;
}
