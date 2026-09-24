import type { SessionRevokedReason } from '../enums/session-revoked-reason.enum.js';

/** Domain view of an `auth_sessions` row. Never includes the refresh-token hash. */
export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: SessionRevokedReason | null;
  lastUsedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Only used inside the refresh flow, where the current hash must be compared. */
export interface AuthSessionWithHash extends AuthSession {
  refreshTokenHash: string;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}
