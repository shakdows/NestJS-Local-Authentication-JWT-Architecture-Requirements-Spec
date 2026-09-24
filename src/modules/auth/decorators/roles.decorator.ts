import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../roles/role.enum.js';
import { ROLES_KEY } from '../auth.constants.js';

/** Declares the roles allowed on a handler or controller; enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
