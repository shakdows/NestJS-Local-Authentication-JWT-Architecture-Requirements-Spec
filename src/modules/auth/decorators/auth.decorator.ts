import { applyDecorators, UseGuards } from '@nestjs/common';
import type { Role } from '../../roles/role.enum.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { Roles } from './roles.decorator.js';

/**
 * Shorthand for `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...roles)` (FR-S-09).
 * `@Auth()` with no roles only requires authentication.
 */
export function Auth(...roles: Role[]) {
  return roles.length > 0
    ? applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...roles))
    : applyDecorators(UseGuards(JwtAuthGuard));
}
