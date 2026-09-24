import Joi from 'joi';
import { DURATION_PATTERN, parseDurationToSeconds } from './duration.util.js';

/** Single source of defaults, shared by the Joi schema and the config factories. */
export const ENV_DEFAULTS = {
  NODE_ENV: 'development',
  PORT: 3000,
  API_PREFIX: '',
  CORS_ORIGINS: '',
  TRUST_PROXY: 'false',
  DATABASE_SSL: false,
  DATABASE_LOGGING: false,
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  JWT_ISSUER: 'nestjs-boilerplate',
  JWT_AUDIENCE: 'nestjs-boilerplate-api',
  AUTH_ARGON2_MEMORY_COST: 19456,
  AUTH_ARGON2_TIME_COST: 2,
  AUTH_ARGON2_PARALLELISM: 1,
  THROTTLE_TTL: 60,
  THROTTLE_LIMIT: 100,
} as const;

const MAX_ACCESS_TTL_SECONDS = 60 * 60; // SEC-JWT-07
const MAX_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // SEC-TOKEN-08

/** Placeholder values from `.env.example`; rejected in production (SEC-CONF-03). */
export const SECRET_PLACEHOLDERS = [
  'change-me-access-secret-at-least-32-characters-long',
  'change-me-refresh-secret-at-least-32-characters-long',
];

const duration = Joi.string().pattern(DURATION_PATTERN, 'duration (e.g. 15m, 7d)');

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default(ENV_DEFAULTS.NODE_ENV),
  PORT: Joi.number().port().default(ENV_DEFAULTS.PORT),
  API_PREFIX: Joi.string()
    .allow('')
    .pattern(/^[^/](.*[^/])?$/, 'no leading or trailing slash')
    .default(ENV_DEFAULTS.API_PREFIX),
  CORS_ORIGINS: Joi.string().allow('').default(ENV_DEFAULTS.CORS_ORIGINS),
  TRUST_PROXY: Joi.alternatives()
    .try(Joi.string().valid('true', 'false'), Joi.number().integer().min(0))
    .default(ENV_DEFAULTS.TRUST_PROXY),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().default(ENV_DEFAULTS.DATABASE_SSL),
  DATABASE_LOGGING: Joi.boolean().default(ENV_DEFAULTS.DATABASE_LOGGING),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: duration.default(ENV_DEFAULTS.JWT_ACCESS_EXPIRES_IN),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .messages({ 'any.invalid': '"JWT_REFRESH_SECRET" must differ from "JWT_ACCESS_SECRET"' }),
  JWT_REFRESH_EXPIRES_IN: duration.default(ENV_DEFAULTS.JWT_REFRESH_EXPIRES_IN),
  JWT_ISSUER: Joi.string().default(ENV_DEFAULTS.JWT_ISSUER),
  JWT_AUDIENCE: Joi.string().default(ENV_DEFAULTS.JWT_AUDIENCE),

  AUTH_ARGON2_MEMORY_COST: Joi.number().integer().min(19456).default(ENV_DEFAULTS.AUTH_ARGON2_MEMORY_COST),
  AUTH_ARGON2_TIME_COST: Joi.number().integer().min(2).default(ENV_DEFAULTS.AUTH_ARGON2_TIME_COST),
  AUTH_ARGON2_PARALLELISM: Joi.number().integer().min(1).default(ENV_DEFAULTS.AUTH_ARGON2_PARALLELISM),

  THROTTLE_TTL: Joi.number().integer().positive().default(ENV_DEFAULTS.THROTTLE_TTL),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(ENV_DEFAULTS.THROTTLE_LIMIT),

  SEED_ADMIN_EMAIL: Joi.string().email().optional(),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).max(128).optional(),
}).custom((env: Record<string, unknown>, helpers) => {
  const accessTtl = parseDurationToSeconds(String(env.JWT_ACCESS_EXPIRES_IN));
  const refreshTtl = parseDurationToSeconds(String(env.JWT_REFRESH_EXPIRES_IN));
  if (accessTtl > MAX_ACCESS_TTL_SECONDS) {
    return helpers.message({ custom: '"JWT_ACCESS_EXPIRES_IN" must be at most 1h' });
  }
  if (refreshTtl > MAX_REFRESH_TTL_SECONDS) {
    return helpers.message({ custom: '"JWT_REFRESH_EXPIRES_IN" must be at most 30d' });
  }
  if (refreshTtl <= accessTtl) {
    return helpers.message({
      custom: '"JWT_REFRESH_EXPIRES_IN" must be longer than "JWT_ACCESS_EXPIRES_IN"',
    });
  }
  if (env.NODE_ENV === 'production') {
    const origins = String(env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim());
    if (origins.includes('*')) {
      return helpers.message({ custom: '"CORS_ORIGINS" must not contain * in production' });
    }
    if (
      SECRET_PLACEHOLDERS.includes(String(env.JWT_ACCESS_SECRET)) ||
      SECRET_PLACEHOLDERS.includes(String(env.JWT_REFRESH_SECRET))
    ) {
      return helpers.message({ custom: 'JWT secrets must not use placeholder values in production' });
    }
    if (env.DATABASE_LOGGING === true) {
      return helpers.message({ custom: '"DATABASE_LOGGING" must be false in production' });
    }
  }
  return env;
});

/**
 * Validates raw environment variables. Used by `ConfigModule.forRoot({ validate })`.
 * Throws a single error listing every problem, so the app refuses to start (FR-CONF-02).
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    throw new Error(`Invalid environment configuration: ${error.message}`);
  }
  return value as Record<string, unknown>;
}
