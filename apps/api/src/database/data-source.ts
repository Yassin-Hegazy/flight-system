/**
 * Standalone DataSource used only by the TypeORM CLI (see the db:* scripts).
 * The CLI runs against the compiled output in dist/, so the globs match .js files there.
 */
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { baseDatabaseOptions } from './database.options';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
}

export default new DataSource({
  ...baseDatabaseOptions(url),
  // The CLI has no Nest container, so entities are found by file name.
  entities: [join(__dirname, '..', 'modules', '**', '*.entity.js')],
  migrations: [join(__dirname, 'migrations', '*.js')],
});
