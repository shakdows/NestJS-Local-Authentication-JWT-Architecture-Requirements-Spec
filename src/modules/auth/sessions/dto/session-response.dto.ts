import type { AuthSession } from '../types/auth-session.type.js';

/** A session as shown to its owner (AUTH_API §3.7). No hashes, no revocation internals. */
export class SessionResponseDto {
  id: string;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

/** A session as shown to an administrator (AUTH_API §3.15): same fields minus `current`. */
export type AdminSessionResponseDto = Omit<SessionResponseDto, 'current'>;

export function toAdminSessionResponse(session: AuthSession): AdminSessionResponseDto {
  return {
    id: session.id,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt ? session.lastUsedAt.toISOString() : null,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export function toSessionResponse(session: AuthSession, currentSessionId: string): SessionResponseDto {
  return { ...toAdminSessionResponse(session), current: session.id === currentSessionId };
}
