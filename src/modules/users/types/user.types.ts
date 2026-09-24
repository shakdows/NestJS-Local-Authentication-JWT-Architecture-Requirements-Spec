import type { Role } from '../../roles/role.enum.js';
import type { UserStatus } from '../enums/user-status.enum.js';

/** Domain shape returned by UsersService. Never an entity, never contains the password hash. */
export interface User {
  id: string;
  email: string;
  roles: Role[];
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Only returned by `findByEmailWithCredentials`, for AuthService credential checks. */
export interface UserWithCredentials extends User {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  roles?: Role[];
  status?: UserStatus;
}

export interface ListUsersQuery {
  page: number;
  limit: number;
  status?: UserStatus;
  role?: Role;
  search?: string;
}

export interface UserStats {
  total: number;
  byStatus: Record<UserStatus, number>;
  byRole: Record<Role, number>;
}
