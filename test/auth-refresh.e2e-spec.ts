import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app.js';
import { http, login, register, setStatus } from './utils/auth-helpers.js';
import { decode, forge, forgeExpired } from './utils/token-forge.js';
import { resetDatabase } from './utils/reset-database.js';
import { TEST_ENV } from './setup/test-env.js';

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

describe('POST /auth/refresh (e2e)', () => {
  let app: NestExpressApplication;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  const refresh = (refreshToken?: unknown, extra: Record<string, unknown> = {}) =>
    http(app).post('/auth/refresh').send({ refreshToken, ...extra });

  async function start() {
    const user = await register(app, 'user@example.com');
    const tokens = await login(app, 'user@example.com');
    const sid = decode<{ sid: string }>(tokens.refreshToken).sid;
    return { user, tokens, sid };
  }

  const sessionRow = async (sid: string) =>
    (await db.query('SELECT * FROM auth_sessions WHERE id = $1', [sid]))[0];

  it('valid refresh token → 200 with a new pair (no user), refresh token changed', async () => {
    const { tokens } = await start();
    const res = await refresh(tokens.refreshToken).expect(200);
    const data = res.body.data;
    expect(Object.keys(data).sort()).toEqual(['accessToken', 'expiresIn', 'refreshToken', 'tokenType']);
    expect(data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(data.refreshToken).not.toBe(tokens.refreshToken);
    // Access tokens have no jti (JWT_SPEC §3.1), so one issued in the same second may be identical.
    expect(decode<{ sid: string }>(data.accessToken).sid).toBe(decode<{ sid: string }>(tokens.accessToken).sid);
    await http(app).get('/auth/me').set('Authorization', `Bearer ${data.accessToken}`).expect(200);
  });

  it('rotation: RT1 → RT2 → RT3, hash replaced each time, sid stable, expiry moves forward', async () => {
    const { tokens, sid } = await start();
    const before = await sessionRow(sid);
    expect(before.refresh_token_hash).toBe(sha256(tokens.refreshToken));

    const rt2 = (await refresh(tokens.refreshToken).expect(200)).body.data.refreshToken;
    const afterFirst = await sessionRow(sid);
    expect(afterFirst.refresh_token_hash).toBe(sha256(rt2));
    expect(afterFirst.last_used_at).not.toBeNull();
    expect(new Date(afterFirst.expires_at).getTime()).toBeGreaterThanOrEqual(new Date(before.expires_at).getTime());
    expect(decode<{ sid: string }>(rt2).sid).toBe(sid);

    const rt3 = (await refresh(rt2).expect(200)).body.data.refreshToken;
    expect((await sessionRow(sid)).refresh_token_hash).toBe(sha256(rt3));
    const [{ count }] = await db.query('SELECT COUNT(*)::int AS count FROM auth_sessions');
    expect(count).toBe(1);
  });

  it('FR-REFRESH-05: reusing a rotated token → 401, session REUSE_DETECTED, newer tokens dead', async () => {
    const { tokens, sid } = await start();
    const second = (await refresh(tokens.refreshToken).expect(200)).body.data;

    const reuse = await refresh(tokens.refreshToken).expect(401);
    expect(reuse.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');

    const row = await sessionRow(sid);
    expect(row.revoked_reason).toBe('REUSE_DETECTED');
    expect(row.revoked_at).not.toBeNull();
    await refresh(second.refreshToken).expect(401);
    await http(app).get('/auth/me').set('Authorization', `Bearer ${second.accessToken}`).expect(401);
  });

  it('reuse detection is per session: other devices keep working', async () => {
    const { tokens } = await start();
    const otherDevice = await login(app, 'user@example.com');
    await refresh(tokens.refreshToken).expect(200);
    await refresh(tokens.refreshToken).expect(401);
    await refresh(otherDevice.refreshToken).expect(200);
  });

  it('concurrent refreshes with the same token → exactly one 200, session ends revoked (strict D-08)', async () => {
    const { tokens, sid } = await start();
    const results = await Promise.all([1, 2, 3].map(() => refresh(tokens.refreshToken)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(1);
    expect(statuses.every((s) => s === 200 || s === 401)).toBe(true);
    expect((await sessionRow(sid)).revoked_reason).toBe('REUSE_DETECTED');
  });

  it('expired refresh token → 401', async () => {
    const { tokens } = await start();
    const claims = decode<Record<string, unknown>>(tokens.refreshToken);
    const res = await refresh(forgeExpired({ ...claims, iat: undefined, exp: undefined }, TEST_ENV.JWT_REFRESH_SECRET)).expect(401);
    expect(res.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
  });

  it('expired session in the DB → 401', async () => {
    const { tokens, sid } = await start();
    await db.query(`UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE id = $1`, [sid]);
    await refresh(tokens.refreshToken).expect(401);
  });

  it('revoked token → 401', async () => {
    const { tokens, sid } = await start();
    await db.query(`UPDATE auth_sessions SET revoked_at = now(), revoked_reason = 'LOGOUT' WHERE id = $1`, [sid]);
    const res = await refresh(tokens.refreshToken).expect(401);
    expect(res.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
    expect((await sessionRow(sid)).revoked_reason).toBe('LOGOUT');
  });

  it('access token used as refresh token → 401 (FR-TOKEN-04)', async () => {
    const { tokens } = await start();
    await refresh(tokens.accessToken).expect(401);
  });

  it('refresh-type claims signed with the ACCESS secret → 401', async () => {
    const { tokens } = await start();
    const claims = decode<Record<string, unknown>>(tokens.refreshToken);
    await refresh(forge({ ...claims, iat: undefined, exp: undefined })).expect(401);
  });

  it('forged token for a real session with a valid signature but unknown jti → reuse → revoked', async () => {
    // Simulates a leaked refresh secret: signature valid but hash not current.
    const { tokens, sid } = await start();
    const claims = decode<Record<string, unknown>>(tokens.refreshToken);
    const forged = forge({ ...claims, jti: 'forged', iat: undefined, exp: undefined }, TEST_ENV.JWT_REFRESH_SECRET);
    await refresh(forged).expect(401);
    expect((await sessionRow(sid)).revoked_reason).toBe('REUSE_DETECTED');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a JWT', 'abc'],
    ['number', 42],
  ])('%s refreshToken → 401 AUTH_REFRESH_TOKEN_INVALID (guard runs before validation)', async (_l, value) => {
    const res = await refresh(value).expect(401);
    expect(res.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
  });

  it('extra body fields → 400 VALIDATION_FAILED', async () => {
    const { tokens } = await start();
    const res = await refresh(tokens.refreshToken, { userId: 'x' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('user suspended → 403 AUTH_ACCOUNT_NOT_ACTIVE and session revoked (USER_NOT_ACTIVE)', async () => {
    const { user, tokens, sid } = await start();
    await setStatus(app, user.id, 'SUSPENDED');
    const res = await refresh(tokens.refreshToken).expect(403);
    expect(res.body.error.code).toBe('AUTH_ACCOUNT_NOT_ACTIVE');
    expect((await sessionRow(sid)).revoked_reason).toBe('USER_NOT_ACTIVE');
    await setStatus(app, user.id, 'ACTIVE');
    await refresh(tokens.refreshToken).expect(401);
  });

  it('new roles are carried by tokens issued on refresh', async () => {
    const { user, tokens } = await start();
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN')`, [user.id]);
    const { accessToken } = (await refresh(tokens.refreshToken).expect(200)).body.data;
    expect(decode<{ roles: string[] }>(accessToken).roles).toEqual(['USER', 'ADMIN']);
  });
});
