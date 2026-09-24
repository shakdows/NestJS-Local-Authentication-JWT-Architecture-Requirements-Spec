import { JwtService } from '@nestjs/jwt';
import { TEST_ENV } from '../setup/test-env.js';

const jwt = new JwtService({});
const now = () => Math.floor(Date.now() / 1000);

type Claims = Record<string, unknown>;

/** Signs arbitrary claims with the given secret (defaults: test access secret, valid iss/aud). */
export function forge(claims: Claims, secret = TEST_ENV.JWT_ACCESS_SECRET, extra: Claims = {}): string {
  const merged = { iss: TEST_ENV.JWT_ISSUER, aud: TEST_ENV.JWT_AUDIENCE, iat: now(), exp: now() + 600, ...claims, ...extra };
  // `undefined` in overrides means "use the default".
  const defined = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
  return jwt.sign({ iat: now(), exp: now() + 600, ...defined }, { secret, algorithm: 'HS256' });
}

/** Same claims, already expired. */
export function forgeExpired(claims: Claims, secret = TEST_ENV.JWT_ACCESS_SECRET): string {
  return forge(claims, secret, { iat: now() - 3600, exp: now() - 60 });
}

/** Unsigned token with `alg: none`. */
export function forgeAlgNone(claims: Claims): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ iss: TEST_ENV.JWT_ISSUER, aud: TEST_ENV.JWT_AUDIENCE, iat: now(), exp: now() + 600, ...claims })}.`;
}

export function decode<T = Claims>(token: string): T {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as T;
}
