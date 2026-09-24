/**
 * Environment for unit and e2e tests. Every secret here is deliberately fake.
 * The database can be overridden with TEST_DATABASE_URL (e.g. in CI).
 */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://app:app@localhost:5432/auth_test',
  JWT_ACCESS_SECRET: 'test-only-access-secret-0123456789abcdefghijklmnop',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret-0123456789abcdefghijklmnop',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  JWT_ISSUER: 'nestjs-boilerplate',
  JWT_AUDIENCE: 'nestjs-boilerplate-api',
  // Generous global limit so functional e2e tests are not throttled; throttling has its own test.
  THROTTLE_LIMIT: '10000',
  THROTTLE_ENABLED: 'false',
  CORS_ORIGINS: 'http://localhost:5173',
};
