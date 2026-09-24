import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, ROLE_ORDER } from '../../roles/role.enum.js';
import type { UserStatus } from '../../users/enums/user-status.enum.js';
import { AuthSessionEntity } from './entities/auth-session.entity.js';
import { SessionRevokedReason } from './enums/session-revoked-reason.enum.js';
import type { AuthSession, AuthSessionWithHash, CreateSessionInput } from './types/auth-session.type.js';

/** Identity data resolved for an access token in a single query (AUTH_DATABASE §6). */
export interface SessionIdentity {
  sessionId: string;
  userId: string;
  email: string;
  status: UserStatus;
  roles: Role[];
}

function toSession(entity: AuthSessionEntity): AuthSession {
  return {
    id: entity.id,
    userId: entity.userId,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt,
    revokedReason: entity.revokedReason,
    lastUsedAt: entity.lastUsedAt,
    ipAddress: entity.ipAddress,
    userAgent: entity.userAgent,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/** The only class that touches `auth_sessions` (NFR-04). */
@Injectable()
export class SessionsRepository {
  constructor(
    @InjectRepository(AuthSessionEntity) private readonly sessions: Repository<AuthSessionEntity>,
  ) {}

  async create(input: CreateSessionInput): Promise<void> {
    await this.sessions.insert(input);
  }

  /**
   * One round trip: usable session ⨝ user ⨝ roles. Returns null when the session is
   * missing, revoked, expired or not owned by `userId`. The user's status is returned as-is
   * so the caller can distinguish "not active" (403) from "invalid" (401).
   */
  async findActiveIdentity(sessionId: string, userId: string): Promise<SessionIdentity | null> {
    const rows: { email: string; status: UserStatus; role: Role | null }[] = await this.sessions
      .createQueryBuilder('s')
      .innerJoin('users', 'u', 'u.id = s.user_id')
      .leftJoin('user_roles', 'r', 'r.user_id = u.id')
      .select(['u.email AS email', 'u.status AS status', 'r.role AS role'])
      .where('s.id = :sessionId AND s.user_id = :userId', { sessionId, userId })
      .andWhere('s.revoked_at IS NULL AND s.expires_at > now()')
      .getRawMany();
    if (rows.length === 0) return null;
    const roles = rows
      .map((row) => row.role)
      .filter((role): role is Role => role !== null)
      .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
    return { sessionId, userId, email: rows[0].email, status: rows[0].status, roles };
  }

  /** Loads a session including its current refresh-token hash (refresh flow only). */
  async findWithHash(sessionId: string): Promise<AuthSessionWithHash | null> {
    const entity = await this.sessions
      .createQueryBuilder('s')
      .addSelect('s.refreshTokenHash')
      .where('s.id = :sessionId', { sessionId })
      .getOne();
    return entity ? { ...toSession(entity), refreshTokenHash: entity.refreshTokenHash } : null;
  }

  /**
   * Compare-and-swap rotation (JWT_SPEC §6.2). Returns false when no row matched, meaning
   * the presented token is no longer current (reuse or a lost concurrent refresh).
   */
  async rotate(
    sessionId: string,
    currentHash: string,
    newHash: string,
    newExpiresAt: Date,
  ): Promise<boolean> {
    const result = await this.sessions
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({
        refreshTokenHash: newHash,
        expiresAt: newExpiresAt,
        lastUsedAt: () => 'now()',
      })
      .where('id = :sessionId AND refresh_token_hash = :currentHash', { sessionId, currentHash })
      .andWhere('revoked_at IS NULL AND expires_at > now()')
      .execute();
    return result.affected === 1;
  }

  /** Revokes matching non-revoked sessions, keeping the first reason (AUTH_DATABASE §5). */
  private async revokeWhere(
    reason: SessionRevokedReason,
    where: string,
    params: Record<string, unknown>,
  ): Promise<number> {
    const result = await this.sessions
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: () => 'now()', revokedReason: reason })
      .where(where, params)
      .andWhere('revoked_at IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  revoke(sessionId: string, reason: SessionRevokedReason): Promise<number> {
    return this.revokeWhere(reason, 'id = :sessionId', { sessionId });
  }

  revokeAllForUser(userId: string, reason: SessionRevokedReason): Promise<number> {
    return this.revokeWhere(reason, 'user_id = :userId', { userId });
  }

  revokeAllExcept(userId: string, keepSessionId: string, reason: SessionRevokedReason): Promise<number> {
    return this.revokeWhere(reason, 'user_id = :userId AND id <> :keepSessionId', {
      userId,
      keepSessionId,
    });
  }

  /** Revokes one usable session owned by the user. 0 ⇒ not found / not owned / already ended. */
  revokeOwned(userId: string, sessionId: string, reason: SessionRevokedReason): Promise<number> {
    return this.revokeWhere(reason, 'user_id = :userId AND id = :sessionId AND expires_at > now()', {
      userId,
      sessionId,
    });
  }

  async listActiveForUser(userId: string): Promise<AuthSession[]> {
    const entities = await this.sessions
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.revoked_at IS NULL AND s.expires_at > now()')
      .orderBy('s.created_at', 'DESC')
      .getMany();
    return entities.map(toSession);
  }
}
