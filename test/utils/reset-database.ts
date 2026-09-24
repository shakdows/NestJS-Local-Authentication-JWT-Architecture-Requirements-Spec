import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Empties every table between test files. FKs cascade from `users`. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  await app
    .get(DataSource)
    .query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
}
