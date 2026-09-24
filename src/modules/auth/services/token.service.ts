import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import jwtConfig from '../../../config/jwt.config.js';
import type { User } from '../../users/types/user.types.js';
import type { AccessTokenPayload, RefreshTokenPayload } from '../interfaces/jwt-payload.interface.js';

const ALGORITHM = 'HS256';

/**
 * Signs access/refresh JWTs and hashes refresh tokens (JWT_SPEC §3–4).
 * Every sign call passes its secret explicitly; `JwtModule` has no default (SEC-JWT-05).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY) private readonly config: ConfigType<typeof jwtConfig>,
  ) {}

  /** Access-token lifetime in seconds (`expiresIn` in API responses). */
  get accessTokenTtlSeconds(): number {
    return this.config.access.ttlSeconds;
  }

  /** Signs an access token bound to `sessionId` with exactly the JWT_SPEC §3.1 claims. */
  signAccessToken(user: Pick<User, 'id' | 'email' | 'roles'>, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles: [...user.roles],
      sid: sessionId,
      type: 'access',
    };
    return this.jwtService.signAsync(payload, {
      secret: this.config.access.secret,
      expiresIn: this.config.access.ttlSeconds,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: ALGORITHM,
    });
  }

  /**
   * Signs a refresh token with a fresh `jti`. `iat` is set explicitly so the returned
   * `expiresAt` equals the token's `exp` exactly (stored as `auth_sessions.expires_at`).
   */
  async signRefreshToken(userId: string, sessionId: string): Promise<{ token: string; expiresAt: Date }> {
    const iat = Math.floor(Date.now() / 1000);
    const payload: RefreshTokenPayload = {
      sub: userId,
      sid: sessionId,
      jti: randomUUID(),
      type: 'refresh',
      iat,
    };
    const token = await this.jwtService.signAsync(payload, {
      secret: this.config.refresh.secret,
      expiresIn: this.config.refresh.ttlSeconds,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: ALGORITHM,
    });
    return { token, expiresAt: new Date((iat + this.config.refresh.ttlSeconds) * 1000) };
  }

  /** SHA-256 lowercase hex. Never bcrypt: it truncates at 72 bytes (SEC-TOKEN-04). */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /** Constant-time comparison of the presented token's hash against the stored one. */
  compareRefreshTokenHash(token: string, storedHash: string): boolean {
    const presented = Buffer.from(this.hashRefreshToken(token), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return presented.length === stored.length && timingSafeEqual(presented, stored);
  }
}
