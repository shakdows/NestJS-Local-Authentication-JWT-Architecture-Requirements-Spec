import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app.js';
import { grantAdmin, http, login, register } from './utils/auth-helpers.js';
import { decode } from './utils/token-forge.js';
import { resetDatabase } from './utils/reset-database.js';

describe('ADMIN user management (e2e)', () => {
  let app: NestExpressApplication;
  let adminToken: string;
  let adminId: string;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    adminId = (await register(app, 'admin@example.com')).id;
    await grantAdmin(app, adminId);
    adminToken = (await login(app, 'admin@example.com')).accessToken;
    userId = (await register(app, 'user@example.com')).id;
    userToken = (await login(app, 'user@example.com')).accessToken;
  });
  afterAll(() => app.close());

  const as = (token: string) => ({
    get: (path: string) => http(app).get(path).set('Authorization', `Bearer ${token}`),
    patch: (path: string, body: object) => http(app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
    delete: (path: string) => http(app).delete(path).set('Authorization', `Bearer ${token}`),
  });

  describe('access control', () => {
    it.each([
      ['GET', '/users'],
      ['GET', '/users/stats'],
      ['GET', '/users/{id}'],
      ['PATCH', '/users/{id}/status'],
      ['PATCH', '/users/{id}/roles'],
      ['GET', '/users/{id}/sessions'],
      ['DELETE', '/users/{id}/sessions'],
    ])('%s %s: USER → 403, anonymous → 401', async (method, template) => {
      const path = template.replace('{id}', userId);
      const call = (token?: string) => {
        const req = method === 'GET' ? http(app).get(path) : method === 'PATCH' ? http(app).patch(path).send({}) : http(app).delete(path);
        return token ? req.set('Authorization', `Bearer ${token}`) : req;
      };
      expect((await call(userToken)).body.error.code).toBe('AUTH_FORBIDDEN');
      expect((await call()).status).toBe(401);
    });
  });

  describe('GET /users', () => {
    it('returns a paginated list of public user representations', async () => {
      const res = await as(adminToken).get('/users?page=1&limit=1').expect(200);
      expect(res.body.data.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].email).toBe('user@example.com');
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it('filters by role, status and search', async () => {
      expect((await as(adminToken).get('/users?role=ADMIN').expect(200)).body.data.items.map((u: { id: string }) => u.id)).toEqual([adminId]);
      expect((await as(adminToken).get('/users?search=USER@').expect(200)).body.data.items.map((u: { id: string }) => u.id)).toEqual([userId]);
      expect((await as(adminToken).get('/users?status=SUSPENDED').expect(200)).body.data.meta.total).toBe(0);
    });

    it.each([
      ['page=0', 'page'],
      ['limit=101', 'limit'],
      ['limit=abc', 'limit'],
      ['status=BANNED', 'status'],
      ['role=ROOT', 'role'],
      ['foo=bar', 'foo'],
    ])('rejects %s with 400', async (qs, field) => {
      const res = await as(adminToken).get(`/users?${qs}`).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
    });
  });

  it('GET /users/stats returns counts by status and role', async () => {
    const res = await as(adminToken).get('/users/stats').expect(200);
    expect(res.body.data).toEqual({
      total: 2,
      byStatus: { ACTIVE: 2, INACTIVE: 0, SUSPENDED: 0, PENDING_VERIFICATION: 0 },
      byRole: { USER: 2, ADMIN: 1 },
    });
  });

  it('GET /users/:id returns one user; unknown → 404; malformed → 400', async () => {
    const res = await as(adminToken).get(`/users/${userId}`).expect(200);
    expect(res.body.data.user).toMatchObject({ id: userId, email: 'user@example.com', roles: ['USER'] });
    await as(adminToken).get('/users/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d').expect(404);
    await as(adminToken).get('/users/nope').expect(400);
  });

  describe('PATCH /users/:id/status', () => {
    it('suspending a user blocks their existing tokens immediately; reactivating restores access', async () => {
      const res = await as(adminToken).patch(`/users/${userId}/status`, { status: 'SUSPENDED' }).expect(200);
      expect(res.body.data.user.status).toBe('SUSPENDED');
      expect((await as(userToken).get('/auth/me')).body.error.code).toBe('AUTH_ACCOUNT_NOT_ACTIVE');

      await as(adminToken).patch(`/users/${userId}/status`, { status: 'ACTIVE' }).expect(200);
      await as(userToken).get('/auth/me').expect(200);
    });

    it('FR-ADMIN-06: an admin cannot change their own status', async () => {
      const res = await as(adminToken).patch(`/users/${adminId}/status`, { status: 'INACTIVE' }).expect(403);
      expect(res.body.error.code).toBe('USER_SELF_MODIFICATION_FORBIDDEN');
    });

    it('validates the body', async () => {
      await as(adminToken).patch(`/users/${userId}/status`, { status: 'BANNED' }).expect(400);
      await as(adminToken).patch(`/users/${userId}/status`, {}).expect(400);
    });

    it('unknown user → 404', async () => {
      await as(adminToken).patch('/users/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d/status', { status: 'ACTIVE' }).expect(404);
    });
  });

  describe('PATCH /users/:id/roles', () => {
    it('promotes USER → ADMIN (effective on next request) and demotes back', async () => {
      const promoted = await as(adminToken).patch(`/users/${userId}/roles`, { roles: ['ADMIN'] }).expect(200);
      expect(promoted.body.data.user.roles).toEqual(['USER', 'ADMIN']);
      await as(userToken).get('/users').expect(200);

      const demoted = await as(adminToken).patch(`/users/${userId}/roles`, { roles: ['USER'] }).expect(200);
      expect(demoted.body.data.user.roles).toEqual(['USER']);
      await as(userToken).get('/users').expect(403);
    });

    it('FR-ADMIN-06: an admin cannot remove their own ADMIN role', async () => {
      const res = await as(adminToken).patch(`/users/${adminId}/roles`, { roles: ['USER'] }).expect(403);
      expect(res.body.error.code).toBe('USER_SELF_MODIFICATION_FORBIDDEN');
      await as(adminToken).get('/users').expect(200);
    });

    it.each([
      [{ roles: [] }],
      [{ roles: ['ROOT'] }],
      [{ roles: ['ADMIN', 'ADMIN'] }],
      [{ roles: 'ADMIN' }],
      [{}],
    ])('rejects invalid body %j with 400', async (body) => {
      const res = await as(adminToken).patch(`/users/${userId}/roles`, body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('/users/:id/sessions', () => {
    it("lists a user's active sessions without internals", async () => {
      await login(app, 'user@example.com', undefined, 'Second-Device');
      const res = await as(adminToken).get(`/users/${userId}/sessions`).expect(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(Object.keys(res.body.data.items[0]).sort()).toEqual(
        ['createdAt', 'expiresAt', 'id', 'ipAddress', 'lastUsedAt', 'userAgent'],
      );
    });

    it('revokes all sessions of a user with ADMIN_REVOKED; their tokens die immediately', async () => {
      const res = await as(adminToken).delete(`/users/${userId}/sessions`).expect(200);
      expect(res.body.data).toEqual({ revokedSessions: 1 });
      await as(userToken).get('/auth/me').expect(401);
      const sid = decode<{ sid: string }>(userToken).sid;
      const [row] = await app.get(DataSource).query('SELECT revoked_reason FROM auth_sessions WHERE id = $1', [sid]);
      expect(row.revoked_reason).toBe('ADMIN_REVOKED');
      await as(adminToken).get('/auth/me').expect(200);
    });

    it('unknown user → 404', async () => {
      await as(adminToken).get('/users/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d/sessions').expect(404);
      await as(adminToken).delete('/users/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d/sessions').expect(404);
    });
  });
});
