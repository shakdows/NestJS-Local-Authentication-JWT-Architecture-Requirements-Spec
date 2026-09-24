import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app.js';
import {
  http,
  login,
  PASSWORD,
  register,
  setStatus,
  withoutTimestamp,
} from './utils/auth-helpers.js';
import { decode } from './utils/token-forge.js';
import { resetDatabase } from './utils/reset-database.js';

describe('POST /auth/login (e2e)', () => {
  let app: NestExpressApplication;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  it('FR-LOGIN-07: valid credentials → 200 with user, tokens, tokenType and expiresIn', async () => {
    const created = await register(app, 'user@example.com');
    const res = await http(app)
      .post('/auth/login')
      .set('User-Agent', 'Mozilla/5.0 test')
      .send({ email: ' USER@example.com ', password: PASSWORD })
      .expect(200);

    const data = res.body.data;
    expect(res.body.success).toBe(true);
    expect(Object.keys(data).sort()).toEqual([
      'accessToken',
      'expiresIn',
      'refreshToken',
      'tokenType',
      'user',
    ]);
    expect(data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(data.user).toMatchObject({
      id: created.id,
      email: 'user@example.com',
      roles: ['USER'],
      status: 'ACTIVE',
    });
    expect(data.user.lastLoginAt).not.toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const access = decode<{
      sub: string;
      sid: string;
      type: string;
      roles: string[];
    }>(data.accessToken);
    const refresh = decode<{ sub: string; sid: string; type: string }>(
      data.refreshToken,
    );
    expect(access).toMatchObject({
      sub: created.id,
      type: 'access',
      roles: ['USER'],
    });
    expect(refresh).toMatchObject({
      sub: created.id,
      type: 'refresh',
      sid: access.sid,
    });
    expect(refresh).not.toHaveProperty('email');
  });

  it('FR-LOGIN-06 / SEC-TOKEN-02: creates a session storing only the SHA-256 of the refresh token', async () => {
    await register(app, 'user@example.com');
    const { refreshToken } = await login(
      app,
      'user@example.com',
      PASSWORD,
      'Agent/1.0',
    );
    const rows = await db.query('SELECT * FROM auth_sessions');
    expect(rows).toHaveLength(1);
    const [session] = rows;
    const { sid, exp } = decode<{ sid: string; exp: number }>(refreshToken);
    expect(session.id).toBe(sid);
    expect(session.refresh_token_hash).toBe(
      createHash('sha256').update(refreshToken).digest('hex'),
    );
    expect(session.refresh_token_hash).not.toBe(refreshToken);
    expect(JSON.stringify(rows)).not.toContain(refreshToken);
    expect(new Date(session.expires_at).getTime()).toBe(exp * 1000);
    expect(session.user_agent).toBe('Agent/1.0');
    expect(session.ip_address).toBeTruthy();
    expect(session.revoked_at).toBeNull();
  });

  it('two logins create two independent sessions (multi-device)', async () => {
    await register(app, 'user@example.com');
    const a = await login(app, 'user@example.com');
    const b = await login(app, 'user@example.com');
    expect(decode<{ sid: string }>(a.accessToken).sid).not.toBe(
      decode<{ sid: string }>(b.accessToken).sid,
    );
    const [{ count }] = await db.query(
      'SELECT COUNT(*)::int AS count FROM auth_sessions',
    );
    expect(count).toBe(2);
  });

  it('FR-LOGIN-03: incorrect password and non-existent user produce identical 401 bodies', async () => {
    await register(app, 'user@example.com');
    const wrong = await http(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'Wrong-pass1' })
      .expect(401);
    const unknown = await http(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'Wrong-pass1' })
      .expect(401);
    expect(wrong.body.error).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
    expect(withoutTimestamp(wrong.body)).toEqual(
      withoutTimestamp(unknown.body),
    );
    const [{ count }] = await db.query(
      'SELECT COUNT(*)::int AS count FROM auth_sessions',
    );
    expect(count).toBe(0);
  });

  it.each(['INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'])(
    'FR-LOGIN-05: %s user with correct password → 403 AUTH_ACCOUNT_NOT_ACTIVE',
    async (status) => {
      const user = await register(app, 'user@example.com');
      await setStatus(app, user.id, status);
      const res = await http(app)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: PASSWORD })
        .expect(403);
      expect(res.body.error).toMatchObject({
        code: 'AUTH_ACCOUNT_NOT_ACTIVE',
        details: { status },
      });
    },
  );

  it('SEC-ENUM-03: inactive user with wrong password → 401 (status not revealed)', async () => {
    const user = await register(app, 'user@example.com');
    await setStatus(app, user.id, 'SUSPENDED');
    const res = await http(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'Wrong-pass1' })
      .expect(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('FR-PWD-04: login does not enforce the registration password policy', async () => {
    const res = await http(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'short' })
      .expect(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it.each([
    ['missing password', { email: 'user@example.com' }, 'password'],
    ['invalid email', { email: 'nope', password: 'x' }, 'email'],
    [
      'password too long',
      { email: 'user@example.com', password: 'x'.repeat(129) },
      'password',
    ],
  ])('%s → 400 VALIDATION_FAILED', async (_label, body, field) => {
    const res = await http(app).post('/auth/login').send(body).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(
      res.body.error.details.map((d: { field: string }) => d.field),
    ).toContain(field);
  });

  it('FR-LOGIN-08: updates last_login_at', async () => {
    const user = await register(app, 'user@example.com');
    await login(app, 'user@example.com');
    const [{ last_login_at }] = await db.query(
      'SELECT last_login_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(last_login_at).not.toBeNull();
  });
});
