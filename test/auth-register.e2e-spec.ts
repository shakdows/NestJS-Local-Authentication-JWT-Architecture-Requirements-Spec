import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app.js';
import { http, PASSWORD, register } from './utils/auth-helpers.js';
import { resetDatabase } from './utils/reset-database.js';

describe('POST /auth/register (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  it('FR-REG-01/05/08: valid registration → 201, USER/ACTIVE, no hash, no session', async () => {
    const res = await http(app)
      .post('/auth/register')
      .send({ email: '  New.User@Example.com ', password: PASSWORD })
      .expect(201);

    expect(res.body.success).toBe(true);
    const { user } = res.body.data;
    expect(Object.keys(res.body.data)).toEqual(['user']);
    expect(user).toMatchObject({
      email: 'new.user@example.com',
      roles: ['USER'],
      status: 'ACTIVE',
      lastLoginAt: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(res.headers['cache-control']).toBe('no-store');

    const [{ password_hash }] = await app
      .get(DataSource)
      .query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    expect(password_hash.startsWith('$argon2id$')).toBe(true);
    expect(password_hash).not.toContain(PASSWORD);
  });

  it.each([
    ['same email', 'dup@example.com'],
    ['different case', 'DUP@Example.com'],
    ['surrounding whitespace', '  dup@example.com  '],
  ])('FR-REG-06: duplicate email (%s) → 409', async (_label, email) => {
    await register(app, 'dup@example.com');
    const res = await http(app)
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(409);
    expect(res.body.error).toMatchObject({
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
      message: 'Email is already registered',
    });
  });

  it('FR-REG-07: concurrent duplicate registrations → one 201, one 409, never 500', async () => {
    const send = () =>
      http(app)
        .post('/auth/register')
        .send({ email: 'race@example.com', password: PASSWORD });
    const statuses = (await Promise.all([send(), send(), send()]))
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([201, 409, 409]);
  });

  it.each([
    ['missing', undefined, 'email is required'],
    ['not an email', 'not-an-email', 'email must be a valid email address'],
    [
      'too long',
      `${'a'.repeat(250)}@example.com`,
      'email must be at most 254 characters',
    ],
    ['not a string', 12345, 'email must be a string'],
  ])(
    'FR-EMAIL-02: invalid email (%s) → 400',
    async (_label, email, message) => {
      const res = await http(app)
        .post('/auth/register')
        .send({ email, password: PASSWORD })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const detail = res.body.error.details.find(
        (d: { field: string }) => d.field === 'email',
      );
      expect(detail.messages).toContain(message);
    },
  );

  it.each([
    ['too short', 'Abc1', 'password must be at least 8 characters'],
    [
      'no digit',
      'OnlyLettersHere',
      'password must contain at least one letter and one digit',
    ],
    [
      'no letter',
      '1234567890',
      'password must contain at least one letter and one digit',
    ],
    [
      'too long',
      `a1${'x'.repeat(127)}`,
      'password must be at most 128 characters',
    ],
    [
      'equals email',
      'weak1@example.com',
      'password must not be the same as the email',
    ],
    ['missing', undefined, 'password is required'],
  ])(
    'FR-PWD: weak password (%s) → 400 without echoing the value',
    async (_label, password, message) => {
      const res = await http(app)
        .post('/auth/register')
        .send({ email: 'Weak1@Example.com', password })
        .expect(400);
      const detail = res.body.error.details.find(
        (d: { field: string }) => d.field === 'password',
      );
      expect(detail.messages).toContain(message);
      if (typeof password === 'string')
        expect(JSON.stringify(res.body)).not.toContain(password);
    },
  );

  it.each([
    ['roles', { roles: ['ADMIN'] }],
    ['status', { status: 'ACTIVE' }],
    ['id', { id: '8f1c2e5a-0b7d-4c1e-9a55-2d3f1b6c7e90' }],
  ])(
    'SEC-VAL-01 / FR-ROLE-08: mass assignment of %s → 400',
    async (field, extra) => {
      const res = await http(app)
        .post('/auth/register')
        .send({ email: 'mass@example.com', password: PASSWORD, ...extra })
        .expect(400);
      expect(res.body.error.details).toEqual([
        { field, messages: [`property ${field} should not exist`] },
      ]);
      const [{ count }] = await app
        .get(DataSource)
        .query('SELECT COUNT(*)::int AS count FROM users');
      expect(count).toBe(0);
    },
  );
});
