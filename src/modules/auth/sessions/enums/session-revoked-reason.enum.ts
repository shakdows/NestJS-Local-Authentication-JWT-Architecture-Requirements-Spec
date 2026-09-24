/** Why a session was revoked (AUTH_DATABASE §5). Revocation is terminal. */
export enum SessionRevokedReason {
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL = 'LOGOUT_ALL',
  LOGOUT_OTHERS = 'LOGOUT_OTHERS',
  REUSE_DETECTED = 'REUSE_DETECTED',
  USER_NOT_ACTIVE = 'USER_NOT_ACTIVE',
  ADMIN_REVOKED = 'ADMIN_REVOKED',
}
