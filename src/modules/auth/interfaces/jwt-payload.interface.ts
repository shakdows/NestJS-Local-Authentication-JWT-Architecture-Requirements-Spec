import type { Role } from '../../roles/role.enum.js';

/** Access-token claims (JWT_SPEC §3.1). `roles` is a UI hint only. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: Role[];
  sid: string;
  type: 'access';
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
}

/** Refresh-token claims (JWT_SPEC §4.1). No identity data beyond `sub`. */
export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  type: 'refresh';
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
}
