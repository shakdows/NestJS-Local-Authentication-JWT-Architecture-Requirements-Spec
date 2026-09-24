import type { UserResponseDto } from '../dto/user-response.dto.js';
import type { User } from '../types/user.types.js';

/**
 * Explicit allowlist mapping (SEC-PWD-03, AP-13): only these fields ever reach a response,
 * even if the input object carries more (e.g. a `passwordHash`).
 */
export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    roles: [...user.roles],
    status: user.status,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
