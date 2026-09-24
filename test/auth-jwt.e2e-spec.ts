import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app.js';
import { http, login, register, setStatus } from './utils/auth-helpers.js';
import {
  decode,
  forge,
  forgeAlgNone,
  forgeExpired,
} from './utils/token-forge.js';
import { resetDatabase } from './utils/reset-database.js';
import { TEST_ENV } from './setup/test-env.js';

describe('Access tokens and GET /auth/me (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  async function session() {
    const user = await register(app, 'user@example.com');
    const tokens = await login(app, 'user@example.com');
    const claims = decode<Record<string, unknown>>(tokens.accessToken);
    return { user, tokens, claims };
  }

  const me = (token?: string) => {
    const req = http(app).get('/auth/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('valid token → 200 with a fresh DB profile', async () => {
    const { user, tokens } = await session();
    const res = await me(tokens.accessToken).expect(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        user: { id: user.id, email: 'user@example.com', roles: ['USER'] },
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('missing token → 401 AUTH_TOKEN_MISSING', async () => {
    const res = await me().expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('expired token → 401 AUTH_TOKEN_EXPIRED', async () => {
    const { claims } = await session();
    const res = await me(
      forgeExpired({ ...claims, iat: undefined, exp: undefined }),
    ).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
  });

  it.each([
    ['tampered signature', (t: string) => `${t.slice(0, -4)}abcd`],
    [
      'tampered payload',
      (t: string) => {
        const [h, , s] = t.split('.');
        const p = Buffer.from(
          JSON.stringify({ ...decode(t), roles: ['ADMIN'] }),
        ).toString('base64url');
        return `${h}.${p}.${s}`;
      },
    ],
    ['garbage', () => 'not.a.jwt'],
  ])('invalid token (%s) → 401 AUTH_TOKEN_INVALID', async (_label, mutate) => {
    const { tokens } = await session();
    const res = await me(mutate(tokens.accessToken)).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('token signed with the refresh secret → 401 AUTH_TOKEN_INVALID', async () => {
    const { claims } = await session();
    const res = await me(
      forge(
        { ...claims, iat: undefined, exp: undefined },
        TEST_ENV.JWT_REFRESH_SECRET,
      ),
    ).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('alg:none token → 401 AUTH_TOKEN_INVALID (SEC-JWT-02)', async () => {
    const { claims } = await session();
    const res = await me(
      forgeAlgNone({ ...claims, iat: undefined, exp: undefined }),
    ).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('refresh token used as bearer → 401 AUTH_TOKEN_INVALID (FR-TOKEN-04)', async () => {
    const { tokens } = await session();
    const res = await me(tokens.refreshToken).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('type:"refresh" signed with the access secret → 401', async () => {
    const { claims } = await session();
    const res = await me(
      forge({ ...claims, type: 'refresh', iat: undefined, exp: undefined }),
    ).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it.each([
    ['wrong issuer', { iss: 'someone-else' }],
    ['wrong audience', { aud: 'other-api' }],
  ])('%s → 401', async (_label, override) => {
    const { claims } = await session();
    const res = await me(
      forge({ ...claims, iat: undefined, exp: undefined, ...override }),
    ).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('non-UUID sid → 401 (never a 500)', async () => {
    const { claims } = await session();
    const res = await me(
      forge({ ...claims, sid: 'not-a-uuid', iat: undefined, exp: undefined }),
    ).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('sid of another user → 401 (session must belong to sub)', async () => {
    const { claims } = await session();
    await register(app, 'other@example.com');
    const other = await login(app, 'other@example.com');
    const otherSid = decode<{ sid: string }>(other.accessToken).sid;
    const res = await me(
      forge({ ...claims, sid: otherSid, iat: undefined, exp: undefined }),
    ).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('FR-GUARD-02: revoked session → 401 AUTH_TOKEN_INVALID immediately', async () => {
    const { tokens, claims } = await session();
    await app
      .get(DataSource)
      .query(
        `UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'ADMIN_REVOKED' WHERE id = $1`,
        [claims.sid],
      );
    const res = await me(tokens.accessToken).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('expired session (DB) with a still-valid access token → 401', async () => {
    const { tokens, claims } = await session();
    await app
      .get(DataSource)
      .query(
        `UPDATE auth_sessions SET expires_at = now() - interval '1 minute' WHERE id = $1`,
        [claims.sid],
      );
    await me(tokens.accessToken).expect(401);
  });

  it('FR-STATUS-03: user suspended after login → 403 AUTH_ACCOUNT_NOT_ACTIVE on the next request', async () => {
    const { user, tokens } = await session();
    await setStatus(app, user.id, 'SUSPENDED');
    const res = await me(tokens.accessToken).expect(403);
    expect(res.body.error.code).toBe('AUTH_ACCOUNT_NOT_ACTIVE');
    expect(res.body.error.details).toBeNull();
  });

  it('deleted user → 401 (sessions cascade)', async () => {
    const { user, tokens } = await session();
    await app
      .get(DataSource)
      .query('DELETE FROM users WHERE id = $1', [user.id]);
    await me(tokens.accessToken).expect(401);
  });
});
