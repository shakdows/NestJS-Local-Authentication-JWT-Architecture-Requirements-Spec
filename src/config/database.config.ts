import { registerAs } from '@nestjs/config';
import { ENV_DEFAULTS } from './env.validation.js';
import { envBool, envRequired } from './env.util.js';

export default registerAs('database', () => ({
  url: envRequired('DATABASE_URL'),
  ssl: envBool('DATABASE_SSL', ENV_DEFAULTS.DATABASE_SSL),
  logging: envBool('DATABASE_LOGGING', ENV_DEFAULTS.DATABASE_LOGGING),
}));
