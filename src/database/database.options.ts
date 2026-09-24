import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';

export interface DatabaseSettings {
  url: string;
  ssl: boolean;
  logging: boolean;
}

/** Shared TypeORM options. `synchronize` is always false (NFR-08). */
export function buildDataSourceOptions(settings: DatabaseSettings): DataSourceOptions {
  return {
    type: 'postgres',
    url: settings.url,
    ssl: settings.ssl ? { rejectUnauthorized: true } : false,
    logging: settings.logging,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    migrationsRun: false,
  };
}
