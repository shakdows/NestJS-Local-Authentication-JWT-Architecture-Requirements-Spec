import { registerAs } from '@nestjs/config';
import { ENV_DEFAULTS } from './env.validation.js';
import { envInt } from './env.util.js';

export default registerAs('auth', () => ({
  argon2: {
    memoryCost: envInt(
      'AUTH_ARGON2_MEMORY_COST',
      ENV_DEFAULTS.AUTH_ARGON2_MEMORY_COST,
    ),
    timeCost: envInt(
      'AUTH_ARGON2_TIME_COST',
      ENV_DEFAULTS.AUTH_ARGON2_TIME_COST,
    ),
    parallelism: envInt(
      'AUTH_ARGON2_PARALLELISM',
      ENV_DEFAULTS.AUTH_ARGON2_PARALLELISM,
    ),
  },
}));
