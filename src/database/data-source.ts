/**
 * DataSource for the TypeORM CLI and standalone scripts (the only place, besides config
 * factories, allowed to read process.env directly — FR-CONF-05).
 */
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './database.options.js';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the real environment.
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export default new DataSource(
  buildDataSourceOptions({
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true',
    logging: process.env.DATABASE_LOGGING === 'true',
  }),
);
