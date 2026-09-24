import { SECRET_PLACEHOLDERS, validateEnv } from './env.validation.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv (FR-CONF-02/03)', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv({ ...valid });
    expect(env.PORT).toBe(3000);
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe('15m');
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe('7d');
    expect(env.AUTH_ARGON2_MEMORY_COST).toBe(19456);
  });

  it.each([
    ['missing JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: undefined }, 'JWT_ACCESS_SECRET'],
    ['short JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: 'short' }, 'JWT_ACCESS_SECRET'],
    ['missing JWT_REFRESH_SECRET', { JWT_REFRESH_SECRET: undefined }, 'JWT_REFRESH_SECRET'],
    ['equal secrets', { JWT_REFRESH_SECRET: 'a'.repeat(32) }, 'must differ'],
    ['missing DATABASE_URL', { DATABASE_URL: undefined }, 'DATABASE_URL'],
    ['non-postgres DATABASE_URL', { DATABASE_URL: 'mysql://x@y/z' }, 'DATABASE_URL'],
    ['bad duration', { JWT_ACCESS_EXPIRES_IN: '15 minutes' }, 'JWT_ACCESS_EXPIRES_IN'],
    ['access TTL above 1h', { JWT_ACCESS_EXPIRES_IN: '2h' }, 'at most 1h'],
    ['refresh TTL above 30d', { JWT_REFRESH_EXPIRES_IN: '31d' }, 'at most 30d'],
    ['refresh not longer than access', { JWT_ACCESS_EXPIRES_IN: '1h', JWT_REFRESH_EXPIRES_IN: '60m' }, 'longer than'],
    ['argon2 memory below minimum', { AUTH_ARGON2_MEMORY_COST: '1024' }, 'AUTH_ARGON2_MEMORY_COST'],
    ['argon2 time cost below minimum', { AUTH_ARGON2_TIME_COST: '1' }, 'AUTH_ARGON2_TIME_COST'],
    ['invalid NODE_ENV', { NODE_ENV: 'staging' }, 'NODE_ENV'],
    ['API_PREFIX with slash', { API_PREFIX: '/api' }, 'API_PREFIX'],
  ])('rejects %s', (_name, override, message) => {
    expect(() => validateEnv({ ...valid, ...override })).toThrow(message);
  });

  describe('production rules', () => {
    const prod = { ...valid, NODE_ENV: 'production' };

    it('rejects * in CORS_ORIGINS', () => {
      expect(() => validateEnv({ ...prod, CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
    });

    it('rejects placeholder secrets (SEC-CONF-03)', () => {
      expect(() =>
        validateEnv({ ...prod, JWT_ACCESS_SECRET: SECRET_PLACEHOLDERS[0] }),
      ).toThrow('placeholder');
    });

    it('rejects THROTTLE_ENABLED=false', () => {
      expect(() => validateEnv({ ...prod, THROTTLE_ENABLED: 'false' })).toThrow('THROTTLE_ENABLED');
    });

    it('rejects DATABASE_LOGGING=true', () => {
      expect(() => validateEnv({ ...prod, DATABASE_LOGGING: 'true' })).toThrow('DATABASE_LOGGING');
    });

    it('accepts a proper production config', () => {
      expect(() =>
        validateEnv({ ...prod, CORS_ORIGINS: 'https://app.example.com' }),
      ).not.toThrow();
    });
  });
});
