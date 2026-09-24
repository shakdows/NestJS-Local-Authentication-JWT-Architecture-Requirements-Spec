import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/roles/role.enum.js';
import { UserStatus } from '../src/modules/users/enums/user-status.enum.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/reset-database.js';

describe('Users persistence (integration)', () => {
  let app: NestExpressApplication;
  let users: UsersService;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    users = app.get(UsersService);
    db = app.get(DataSource);
  });

  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  it('creates and reads back a user with roles, stored email normalized', async () => {
    const created = await users.create({
      email: 'User@Example.com',
      passwordHash: 'hash-1',
    });
    expect(created).toMatchObject({
      email: 'user@example.com',
      roles: [Role.USER],
      status: UserStatus.ACTIVE,
    });
    expect(await users.findById(created.id)).toEqual(created);
    expect(await users.findByEmail(' USER@example.com')).toEqual(created);
  });

  it('never returns passwordHash except from findByEmailWithCredentials', async () => {
    const created = await users.create({
      email: 'a@example.com',
      passwordHash: 'secret-hash',
    });
    expect(await users.findById(created.id)).not.toHaveProperty('passwordHash');
    expect(await users.findByEmail('a@example.com')).not.toHaveProperty(
      'passwordHash',
    );
    expect(
      await users.findByEmailWithCredentials('a@example.com'),
    ).toMatchObject({
      passwordHash: 'secret-hash',
    });
  });

  it('maps duplicate emails to AUTH_EMAIL_ALREADY_EXISTS (FR-REG-06/07)', async () => {
    await users.create({ email: 'dup@example.com', passwordHash: 'h' });
    await expect(
      users.create({ email: 'DUP@example.com', passwordHash: 'h' }),
    ).rejects.toMatchObject({
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
    });
  });

  it('rejects a non-lowercase email at the database level (ck_users_email_lowercase)', async () => {
    await expect(
      db.query(
        `INSERT INTO users (email, password_hash) VALUES ('Upper@Example.com', 'h')`,
      ),
    ).rejects.toThrow(/ck_users_email_lowercase/);
  });

  it('cascades role deletion when a user is deleted', async () => {
    const created = await users.create({
      email: 'c@example.com',
      passwordHash: 'h',
      roles: [Role.ADMIN],
    });
    await db.query('DELETE FROM users WHERE id = $1', [created.id]);
    const [{ count }] = await db.query(
      'SELECT COUNT(*)::int AS count FROM user_roles WHERE user_id = $1',
      [created.id],
    );
    expect(count).toBe(0);
  });

  it('lists with filters and keeps each user complete role list', async () => {
    const admin = await users.create({
      email: 'admin@example.com',
      passwordHash: 'h',
      roles: [Role.ADMIN],
    });
    await users.create({ email: 'bob@example.com', passwordHash: 'h' });
    await users.create({ email: 'b_o%b@example.com', passwordHash: 'h' });

    const onlyAdmins = await users.list({
      page: 1,
      limit: 10,
      role: Role.ADMIN,
    });
    expect(onlyAdmins.total).toBe(1);
    expect(onlyAdmins.items[0]).toMatchObject({
      id: admin.id,
      roles: [Role.USER, Role.ADMIN],
    });

    const search = await users.list({ page: 1, limit: 10, search: '_o%' });
    expect(search.items.map((u) => u.email)).toEqual(['b_o%b@example.com']);

    const paged = await users.list({ page: 2, limit: 2 });
    expect(paged.total).toBe(3);
    expect(paged.items).toHaveLength(1);
  });

  it('computes stats by status and role', async () => {
    const a = await users.create({
      email: 'a1@example.com',
      passwordHash: 'h',
      roles: [Role.ADMIN],
    });
    const b = await users.create({
      email: 'b1@example.com',
      passwordHash: 'h',
    });
    await users.updateStatus(a.id, b.id, UserStatus.SUSPENDED);
    expect(await users.getStats()).toEqual({
      total: 2,
      byStatus: {
        ACTIVE: 1,
        INACTIVE: 0,
        SUSPENDED: 1,
        PENDING_VERIFICATION: 0,
      },
      byRole: { USER: 2, ADMIN: 1 },
    });
  });

  it('replaces roles atomically', async () => {
    const admin = await users.create({
      email: 'root@example.com',
      passwordHash: 'h',
      roles: [Role.ADMIN],
    });
    const target = await users.create({
      email: 't@example.com',
      passwordHash: 'h',
    });
    expect(
      (await users.setRoles(admin.id, target.id, [Role.ADMIN])).roles,
    ).toEqual([Role.USER, Role.ADMIN]);
    expect(
      (await users.setRoles(admin.id, target.id, [Role.USER])).roles,
    ).toEqual([Role.USER]);
  });
});
