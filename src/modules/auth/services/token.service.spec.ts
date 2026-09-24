import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { Role } from '../../roles/role.enum.js';
import { TokenService } from './token.service.js';

const config = {
  access: { secret: 'a'.repeat(40), expiresIn: '15m', ttlSeconds: 900 },
  refresh: { secret: 'r'.repeat(40), expiresIn: '7d', ttlSeconds: 604800 },
  issuer: 'iss-test',
  audience: 'aud-test',
};

describe('TokenService (JWT_SPEC)', () => {
  const jwt = new JwtService({});
  const service = new TokenService(jwt, config);
  const user = {
    id: '8f1c2e5a-0b7d-4c1e-9a55-2d3f1b6c7e90',
    email: 'user@example.com',
    roles: [Role.USER],
  };
  const sid = '3b0e7a52-6f2d-4a8c-b1e4-9c7d5f0a1e23';

  it('access token carries exactly the JWT_SPEC §3.1 claims, HS256, TTL from config', async () => {
    const token = await service.signAccessToken(user, sid);
    const [header] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
    const payload = await jwt.verifyAsync(token, {
      secret: config.access.secret,
      algorithms: ['HS256'],
    });
    expect(Object.keys(payload).sort()).toEqual([
      'aud',
      'email',
      'exp',
      'iat',
      'iss',
      'roles',
      'sid',
      'sub',
      'type',
    ]);
    expect(payload).toMatchObject({
      sub: user.id,
      email: user.email,
      roles: ['USER'],
      sid,
      type: 'access',
      iss: 'iss-test',
      aud: 'aud-test',
    });
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('access token is not verifiable with the refresh secret (SEC-JWT-01)', async () => {
    const token = await service.signAccessToken(user, sid);
    await expect(
      jwt.verifyAsync(token, { secret: config.refresh.secret }),
    ).rejects.toThrow();
  });

  it('refresh token carries only sub/sid/jti/type (+ standard claims) and matches expiresAt', async () => {
    const { token, expiresAt } = await service.signRefreshToken(user.id, sid);
    const payload = await jwt.verifyAsync(token, {
      secret: config.refresh.secret,
      algorithms: ['HS256'],
    });
    expect(Object.keys(payload).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'jti',
      'sid',
      'sub',
      'type',
    ]);
    expect(payload.type).toBe('refresh');
    expect(payload.exp - payload.iat).toBe(604800);
    expect(expiresAt.getTime()).toBe(payload.exp * 1000);
  });

  it('two refresh tokens for the same session differ (unique jti)', async () => {
    const a = await service.signRefreshToken(user.id, sid);
    const b = await service.signRefreshToken(user.id, sid);
    expect(a.token).not.toBe(b.token);
  });

  it('hashes refresh tokens with SHA-256 hex (SEC-TOKEN-02/04)', () => {
    const hash = service.hashRefreshToken('some.jwt.token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(
      createHash('sha256').update('some.jwt.token').digest('hex'),
    );
    expect(service.hashRefreshToken('some.jwt.token')).toBe(hash);
  });

  it('compares hashes in constant time and is safe on length mismatch (SEC-TOKEN-03)', () => {
    const hash = service.hashRefreshToken('token-1');
    expect(service.compareRefreshTokenHash('token-1', hash)).toBe(true);
    expect(service.compareRefreshTokenHash('token-2', hash)).toBe(false);
    expect(service.compareRefreshTokenHash('token-1', 'abcd')).toBe(false);
  });

  it('exposes the access TTL in seconds', () => {
    expect(service.accessTokenTtlSeconds).toBe(900);
  });
});
