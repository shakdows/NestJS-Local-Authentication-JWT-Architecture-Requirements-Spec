import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../../roles/role.enum.js';
import { RolesService } from '../../roles/roles.service.js';
import { ROLES_KEY } from '../auth.constants.js';
import { AuthErrors } from '../auth.errors.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';

/**
 * Role-based authorization (FR-ROLE-03..07). Uses the DB roles that JwtStrategy loaded,
 * never the token claim, and fails closed when no authenticated user is present.
 * Must run after JwtAuthGuard: `@UseGuards(JwtAuthGuard, RolesGuard)`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const user = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>().user;
    if (!user) throw AuthErrors.tokenMissing();
    if (!this.rolesService.hasAnyRole(user.roles, required)) throw AuthErrors.forbidden();
    return true;
  }
}
