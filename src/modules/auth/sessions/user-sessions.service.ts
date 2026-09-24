import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service.js';
import { AuthErrors } from '../auth.errors.js';
import type { LogoutResponseDto } from '../dto/logout-response.dto.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';
import {
  AdminSessionResponseDto,
  SessionResponseDto,
  toAdminSessionResponse,
  toSessionResponse,
} from './dto/session-response.dto.js';
import { SessionRevokedReason } from './enums/session-revoked-reason.enum.js';
import { SessionsService } from './sessions.service.js';

/**
 * Device-management use cases for session owners and administrators, built on SessionsService.
 * Keeps controllers thin and response mapping out of SessionsService.
 */
@Injectable()
export class UserSessionsService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly usersService: UsersService,
  ) {}

  /** The caller's usable sessions, flagging the current one (FR-S-01). */
  async listOwn(user: AuthenticatedUser): Promise<{ items: SessionResponseDto[] }> {
    const sessions = await this.sessionsService.listActiveForUser(user.id);
    return { items: sessions.map((s) => toSessionResponse(s, user.sessionId)) };
  }

  /** Revokes one of the caller's sessions; foreign/unknown ids are 404 (FR-S-02, SEC-SESS-04). */
  async revokeOwn(user: AuthenticatedUser, sessionId: string): Promise<LogoutResponseDto> {
    const revokedSessions = await this.sessionsService.revokeOwned(user.id, sessionId, SessionRevokedReason.LOGOUT);
    if (revokedSessions === 0) throw AuthErrors.notFound();
    return { revokedSessions };
  }

  /** Revokes every session except the current one (FR-S-03). */
  async revokeOthers(user: AuthenticatedUser): Promise<LogoutResponseDto> {
    const revokedSessions = await this.sessionsService.revokeAllExcept(
      user.id,
      user.sessionId,
      SessionRevokedReason.LOGOUT_OTHERS,
    );
    return { revokedSessions };
  }

  /** Admin: a user's usable sessions (FR-ADMIN-07). 404 for unknown users. */
  async listForUser(userId: string): Promise<{ items: AdminSessionResponseDto[] }> {
    await this.usersService.getByIdOrFail(userId);
    const sessions = await this.sessionsService.listActiveForUser(userId);
    return { items: sessions.map(toAdminSessionResponse) };
  }

  /** Admin: revokes every session of a user with ADMIN_REVOKED (FR-ADMIN-07). */
  async revokeAllForUser(userId: string): Promise<LogoutResponseDto> {
    await this.usersService.getByIdOrFail(userId);
    const revokedSessions = await this.sessionsService.revokeAllForUser(userId, SessionRevokedReason.ADMIN_REVOKED);
    return { revokedSessions };
  }
}
