import type { Role } from '../../roles/role.enum.js';
import type { UserStatus } from '../enums/user-status.enum.js';

/** The only user representation the API returns (AUTH_API §2.5). */
export class UserResponseDto {
  id: string;
  email: string;
  roles: Role[];
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
