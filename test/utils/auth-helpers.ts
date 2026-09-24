import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

export const PASSWORD = 'S3cure-passphrase';

export function http(app: INestApplication) {
  return request(app.getHttpServer());
}

export async function register(
  app: INestApplication,
  email: string,
  password = PASSWORD,
) {
  const res = await http(app).post('/auth/register').send({ email, password });
  if (res.status !== 201)
    throw new Error(
      `register failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body.data.user as { id: string; email: string };
}

export async function login(
  app: INestApplication,
  email: string,
  password = PASSWORD,
  userAgent = 'vitest-agent',
) {
  const res = await http(app)
    .post('/auth/login')
    .set('User-Agent', userAgent)
    .send({ email, password });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as {
    user: { id: string; email: string; roles: string[] };
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

/** Grants ADMIN directly in the database (there is no public way to do it, by design). */
export async function grantAdmin(app: INestApplication, userId: string) {
  await app
    .get(DataSource)
    .query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN') ON CONFLICT DO NOTHING`,
      [userId],
    );
}

export async function setStatus(
  app: INestApplication,
  userId: string,
  status: string,
) {
  await app
    .get(DataSource)
    .query(`UPDATE users SET status = $2 WHERE id = $1`, [userId, status]);
}

/** Response body without the volatile timestamp, for byte-equality comparisons. */
export function withoutTimestamp(body: { error?: { timestamp?: string } }) {
  const clone = structuredClone(body);
  if (clone.error) delete clone.error.timestamp;
  return clone;
}
