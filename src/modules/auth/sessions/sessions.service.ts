import { Injectable, Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { UserStatus } from '../../users/enums/user-status.enum.js';
import { UsersService } from '../../users/users.service.js';
import { AuthErrors } from '../auth.errors.js';
import type { RefreshTokenPayload } from '../interfaces/jwt-payload.interface.js';
import { TokenService } from '../services/token.service.js';
import type { RefreshContext } from '../types/refresh-context.type.js';
import { SessionRevokedReason } from './enums/session-revoked-reason.enum.js';
import { SessionIdentity, SessionsRepository } from './sessions.repository.js';
import type { AuthSession, CreateSessionInput } from './types/auth-session.type.js';

/**
 * Session lifecycle: create, look up, validate for refresh, rotate, revoke.
 * Logs security events with identifiers only — never token material (SEC-LOG-01/03).
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger('AuthSessions');

  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  /** Persists a new session. The caller generated `id` and already signed tokens with it. */
  create(input: CreateSessionInput): Promise<void> {
    return this.sessionsRepository.create(input);
  }

  /**
   * Resolves the identity behind an access token: usable session + its user + DB roles.
   * Returns null for malformed ids, revoked/expired/unknown sessions or a user mismatch.
   */
  async findActiveSessionForAccess(sessionId: string, userId: string): Promise<SessionIdentity | null> {
    if (!isUUID(sessionId) || !isUUID(userId)) return null;
    return this.sessionsRepository.findActiveIdentity(sessionId, userId);
  }

  /**
   * Validates a signature-verified refresh token against its session (JWT_SPEC §4.4).
   * A valid signature with a non-current hash is reuse: the session is revoked.
   * Throws `AUTH_REFRESH_TOKEN_INVALID`, or `AUTH_ACCOUNT_NOT_ACTIVE` for non-active users.
   */
  async validateForRefresh(payload: RefreshTokenPayload, rawToken: string): Promise<RefreshContext> {
    if (payload.type !== 'refresh' || !isUUID(payload.sid) || !isUUID(payload.sub)) {
      throw AuthErrors.refreshTokenInvalid();
    }
    const session = await this.sessionsRepository.findWithHash(payload.sid);
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw AuthErrors.refreshTokenInvalid();
    }
    if (!this.tokenService.compareRefreshTokenHash(rawToken, session.refreshTokenHash)) {
      await this.revokeForReuse(session.id, session.userId);
      throw AuthErrors.refreshTokenInvalid();
    }
    const user = await this.usersService.findById(session.userId);
    if (!user) throw AuthErrors.refreshTokenInvalid();
    if (user.status !== UserStatus.ACTIVE) {
      await this.sessionsRepository.revoke(session.id, SessionRevokedReason.USER_NOT_ACTIVE);
      throw AuthErrors.accountNotActive();
    }
    return { userId: session.userId, sessionId: session.id, refreshToken: rawToken };
  }

  /** Compare-and-swap rotation. False ⇒ the presented token was no longer current. */
  rotate(sessionId: string, expectedCurrentHash: string, newHash: string, newExpiresAt: Date): Promise<boolean> {
    return this.sessionsRepository.rotate(sessionId, expectedCurrentHash, newHash, newExpiresAt);
  }

  /** Revokes a session after reuse is detected and records a security event. */
  async revokeForReuse(sessionId: string, userId: string): Promise<void> {
    await this.sessionsRepository.revoke(sessionId, SessionRevokedReason.REUSE_DETECTED);
    this.logger.warn({ event: 'auth.refresh.reuse_detected', userId, sessionId });
  }

  revoke(sessionId: string, reason: SessionRevokedReason): Promise<number> {
    return this.sessionsRepository.revoke(sessionId, reason);
  }

  revokeAllForUser(userId: string, reason: SessionRevokedReason): Promise<number> {
    return this.sessionsRepository.revokeAllForUser(userId, reason);
  }

  revokeAllExcept(userId: string, keepSessionId: string, reason: SessionRevokedReason): Promise<number> {
    return this.sessionsRepository.revokeAllExcept(userId, keepSessionId, reason);
  }

  /** Usable (non-revoked, non-expired) sessions, newest first. */
  listActiveForUser(userId: string): Promise<AuthSession[]> {
    return this.sessionsRepository.listActiveForUser(userId);
  }

  /** Revokes one of the user's own sessions. 0 ⇒ not found, not owned, or already ended. */
  revokeOwned(userId: string, sessionId: string, reason: SessionRevokedReason): Promise<number> {
    return this.sessionsRepository.revokeOwned(userId, sessionId, reason);
  }
}
