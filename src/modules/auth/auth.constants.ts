/** Passport strategy names. */
export const JWT_STRATEGY = 'jwt';
export const JWT_REFRESH_STRATEGY = 'jwt-refresh';

/** Metadata key used by @Roles() and RolesGuard. */
export const ROLES_KEY = 'roles';

/** Password policy (FR-PWD-01/02). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_LETTER_AND_DIGIT = /^(?=.*[A-Za-z])(?=.*\d).+$/s;
export const EMAIL_MAX_LENGTH = 254;
export const REFRESH_TOKEN_MAX_LENGTH = 2048;

/** Route-specific rate limits (SEC-RATE-02..04). ttl in milliseconds (@nestjs/throttler v6). */
export const AUTH_THROTTLE = {
  register: { limit: 5, ttl: 60_000 },
  login: { limit: 5, ttl: 60_000 },
  refresh: { limit: 30, ttl: 60_000 },
} as const;

/** SHOULD (SEC-RATE-03): additional login limit per IP + normalized email. */
export const LOGIN_ACCOUNT_THROTTLE = { limit: 10, ttl: 15 * 60_000 } as const;
