import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app.js';
import { http, login, register } from './utils/auth-helpers.js';
import { decode } from './utils/token-forge.js';
import { resetDatabase } from './utils/reset-database.js';

describe('Logout and session revocation (e2e)', () => {
  let app: NestExpressApplication;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sidOf = (token: string) => decode<{ sid: string }>(token).sid;
  const reasonOf = async (sid: string) =>
    (
      await db.query('SELECT revoked_reason FROM auth_sessions WHERE id = $1', [
        sid,
      ])
    )[0].revoked_reason;

  async function devices(count: number) {
    await register(app, 'user@example.com');
    const list = [];
    for (let i = 0; i < count; i += 1)
      list.push(await login(app, 'user@example.com', undefined, `Device-${i}`));
    return list;
  }

  describe('POST /auth/logout', () => {
    it('revokes the current session: access and refresh tokens die, other devices survive', async () => {
      const [phone, laptop] = await devices(2);
      const res = await http(app)
        .post('/auth/logout')
        .set(bearer(phone.accessToken))
        .expect(200);
      expect(res.body).toEqual({ success: true, data: { revokedSessions: 1 } });

      await http(app)
        .get('/auth/me')
        .set(bearer(phone.accessToken))
        .expect(401);
      const refresh = await http(app)
        .post('/auth/refresh')
        .send({ refreshToken: phone.refreshToken })
        .expect(401);
      expect(refresh.body.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
      expect(await reasonOf(sidOf(phone.accessToken))).toBe('LOGOUT');

      await http(app)
        .get('/auth/me')
        .set(bearer(laptop.accessToken))
        .expect(200);
      await http(app)
        .post('/auth/refresh')
        .send({ refreshToken: laptop.refreshToken })
        .expect(200);
    });

    it('a second logout with the same token is a 401 (client treats it as already logged out)', async () => {
      const [phone] = await devices(1);
      await http(app)
        .post('/auth/logout')
        .set(bearer(phone.accessToken))
        .expect(200);
      const again = await http(app)
        .post('/auth/logout')
        .set(bearer(phone.accessToken))
        .expect(401);
      expect(again.body.error.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('requires an access token', async () => {
      const res = await http(app).post('/auth/logout').expect(401);
      expect(res.body.error.code).toBe('AUTH_TOKEN_MISSING');
    });

    it('does not accept a refresh token as bearer', async () => {
      const [phone] = await devices(1);
      await http(app)
        .post('/auth/logout')
        .set(bearer(phone.refreshToken))
        .expect(401);
    });

    it('keeps the first revocation reason (revocation is terminal)', async () => {
      const [phone, laptop] = await devices(2);
      await http(app)
        .post('/auth/logout')
        .set(bearer(phone.accessToken))
        .expect(200);
      await http(app)
        .post('/auth/logout-all')
        .set(bearer(laptop.accessToken))
        .expect(200);
      expect(await reasonOf(sidOf(phone.accessToken))).toBe('LOGOUT');
      expect(await reasonOf(sidOf(laptop.accessToken))).toBe('LOGOUT_ALL');
    });
  });

  describe('POST /auth/logout-all', () => {
    it('revokes every session including the current one', async () => {
      const list = await devices(3);
      const res = await http(app)
        .post('/auth/logout-all')
        .set(bearer(list[0].accessToken))
        .expect(200);
      expect(res.body.data).toEqual({ revokedSessions: 3 });
      for (const device of list) {
        await http(app)
          .get('/auth/me')
          .set(bearer(device.accessToken))
          .expect(401);
        await http(app)
          .post('/auth/refresh')
          .send({ refreshToken: device.refreshToken })
          .expect(401);
        expect(await reasonOf(sidOf(device.accessToken))).toBe('LOGOUT_ALL');
      }
    });

    it("does not touch other users' sessions", async () => {
      const [mine] = await devices(1);
      await register(app, 'other@example.com');
      const other = await login(app, 'other@example.com');
      await http(app)
        .post('/auth/logout-all')
        .set(bearer(mine.accessToken))
        .expect(200);
      await http(app)
        .get('/auth/me')
        .set(bearer(other.accessToken))
        .expect(200);
    });
  });

  describe('own sessions (/auth/sessions)', () => {
    it('GET lists usable sessions, flags the current one, exposes no internals', async () => {
      const [a, b, c] = await devices(3);
      await http(app)
        .post('/auth/logout')
        .set(bearer(c.accessToken))
        .expect(200);

      const res = await http(app)
        .get('/auth/sessions')
        .set(bearer(a.accessToken))
        .expect(200);
      const items = res.body.data.items;
      expect(items).toHaveLength(2);
      expect(items.map((i: { id: string }) => i.id).sort()).toEqual(
        [sidOf(a.accessToken), sidOf(b.accessToken)].sort(),
      );
      expect(items.find((i: { current: boolean }) => i.current).id).toBe(
        sidOf(a.accessToken),
      );
      expect(Object.keys(items[0]).sort()).toEqual([
        'createdAt',
        'current',
        'expiresAt',
        'id',
        'ipAddress',
        'lastUsedAt',
        'userAgent',
      ]);
      expect(
        items.map((i: { userAgent: string }) => i.userAgent).sort(),
      ).toEqual(['Device-0', 'Device-1']);
      expect(JSON.stringify(res.body)).not.toMatch(/hash|revoked/i);
    });

    it('DELETE /:id revokes one own session', async () => {
      const [a, b] = await devices(2);
      const res = await http(app)
        .delete(`/auth/sessions/${sidOf(b.accessToken)}`)
        .set(bearer(a.accessToken))
        .expect(200);
      expect(res.body.data).toEqual({ revokedSessions: 1 });
      await http(app).get('/auth/me').set(bearer(b.accessToken)).expect(401);
      await http(app).get('/auth/me').set(bearer(a.accessToken)).expect(200);
    });

    it("DELETE on another user's session → 404 and nothing is revoked (SEC-SESS-04)", async () => {
      const [mine] = await devices(1);
      await register(app, 'other@example.com');
      const other = await login(app, 'other@example.com');
      const res = await http(app)
        .delete(`/auth/sessions/${sidOf(other.accessToken)}`)
        .set(bearer(mine.accessToken))
        .expect(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
      await http(app)
        .get('/auth/me')
        .set(bearer(other.accessToken))
        .expect(200);
    });

    it('DELETE with an already revoked or unknown id → 404; malformed id → 400', async () => {
      const [a, b] = await devices(2);
      await http(app)
        .post('/auth/logout')
        .set(bearer(b.accessToken))
        .expect(200);
      await http(app)
        .delete(`/auth/sessions/${sidOf(b.accessToken)}`)
        .set(bearer(a.accessToken))
        .expect(404);
      await http(app)
        .delete('/auth/sessions/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d')
        .set(bearer(a.accessToken))
        .expect(404);
      const bad = await http(app)
        .delete('/auth/sessions/not-a-uuid')
        .set(bearer(a.accessToken))
        .expect(400);
      expect(bad.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'id', messages: ['id must be a UUID'] }],
      });
    });

    it('POST revoke-others keeps only the current session', async () => {
      const [a, b, c] = await devices(3);
      const res = await http(app)
        .post('/auth/sessions/revoke-others')
        .set(bearer(a.accessToken))
        .expect(200);
      expect(res.body.data).toEqual({ revokedSessions: 2 });
      await http(app).get('/auth/me').set(bearer(a.accessToken)).expect(200);
      await http(app).get('/auth/me').set(bearer(b.accessToken)).expect(401);
      await http(app)
        .post('/auth/refresh')
        .send({ refreshToken: c.refreshToken })
        .expect(401);
      expect(await reasonOf(sidOf(b.accessToken))).toBe('LOGOUT_OTHERS');
    });

    it('requires authentication', async () => {
      await http(app).get('/auth/sessions').expect(401);
    });
  });
});
