import { Injectable } from '@nestjs/common';
import { Role } from './role.enum.js';

/**
 * Roles each role implicitly includes (FR-ROLE-04): ADMIN ⊇ USER.
 * A future role is one entry, e.g. `SUPER_ADMIN: [Role.ADMIN]`.
 */
export const ROLE_HIERARCHY: Readonly<Record<Role, readonly Role[]>> = {
  [Role.ADMIN]: [Role.USER],
  [Role.USER]: [],
};

@Injectable()
export class RolesService {
  /** Returns the given roles plus every role they include, transitively. */
  expand(roles: readonly Role[]): Set<Role> {
    const result = new Set<Role>();
    const pending = [...roles];
    while (pending.length > 0) {
      const role = pending.pop() as Role;
      if (result.has(role)) continue;
      result.add(role);
      pending.push(...(ROLE_HIERARCHY[role] ?? []));
    }
    return result;
  }

  /** True when `required` is empty or the user holds at least one required role (after expansion). */
  hasAnyRole(userRoles: readonly Role[], required: readonly Role[]): boolean {
    if (required.length === 0) return true;
    const effective = this.expand(userRoles);
    return required.some((role) => effective.has(role));
  }
}
