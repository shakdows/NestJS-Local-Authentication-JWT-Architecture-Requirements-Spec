/** Application roles (FR-ROLE-01). Adding a role = enum value + migration + hierarchy entry. */
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

/** Stable display/storage order. */
export const ROLE_ORDER: readonly Role[] = [Role.USER, Role.ADMIN];
