import type { Role } from '../../roles/role.enum.js';
import type { UserStatus } from '../../users/enums/user-status.enum.js';

/** `request.user` after JwtAuthGuard. Roles and status come from the database, not the token. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  roles: Role[];
  status: UserStatus;
  sessionId: string;
};
