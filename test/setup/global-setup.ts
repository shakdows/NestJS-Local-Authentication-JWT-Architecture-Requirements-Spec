import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/database/database.options.js';
import { TEST_ENV } from './test-env.js';

/** Recreates the test schema from migrations once per e2e run. */
export async function setup(): Promise<void> {
  const dataSource = new DataSource(
    buildDataSourceOptions({
      url: TEST_ENV.DATABASE_URL,
      ssl: false,
      logging: false,
    }),
  );
  await dataSource.initialize();
  try {
    await dataSource.dropDatabase();
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}
