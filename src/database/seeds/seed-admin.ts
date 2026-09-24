/**
 * Creates the initial ADMIN from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (FR-S-08).
 * Idempotent: does nothing if the email already exists. Refuses to run in production
 * unless `--force` is passed. Run with `npm run seed` (uses the compiled build so Nest DI
 * metadata is available).
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppModule } from '../../app.module.js';
import { RegisterDto } from '../../modules/auth/dto/register.dto.js';
import { PasswordService } from '../../modules/auth/services/password.service.js';
import { Role } from '../../modules/roles/role.enum.js';
import { UsersService } from '../../modules/users/users.service.js';

const logger = new Logger('SeedAdmin');

async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Use the real environment.
  }
  if (
    process.env.NODE_ENV === 'production' &&
    !process.argv.includes('--force')
  ) {
    throw new Error('Refusing to seed in production without --force');
  }
  const input = plainToInstance(RegisterDto, {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  });
  const errors = await validate(input);
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new Error(
      `Invalid SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD: ${messages.join('; ')}`,
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const users = app.get(UsersService);
    if (await users.existsByEmail(input.email)) {
      console.log('Admin user already exists; nothing to do.');
      return;
    }
    const passwordHash = await app
      .get(PasswordService, { strict: false })
      .hash(input.password);
    const admin = await users.create({
      email: input.email,
      passwordHash,
      roles: [Role.USER, Role.ADMIN],
    });
    console.log(`Created admin user ${admin.id}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
