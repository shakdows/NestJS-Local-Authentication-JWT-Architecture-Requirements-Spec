# Epic 02 — Users and Roles

## Responsibility

This epic owns **the user record and what a user is allowed to do**:

- the user domain model and its persistence service (`UsersService`, `UsersRepository`)
- account status (`UserStatus`) and its effect on access
- the role model (`Role` enum, `user_roles`), the role hierarchy (`RolesService`)
- the authorization mechanism: `@Roles()`, `RolesGuard`, `@Auth()`
- the invariants for role changes (always `USER`, admin self-protection)

## Does Not Own

| Concern | Owner |
|---|---|
| Registration/login flows, `JwtAuthGuard` | [01](./01-authentication-and-access.md) |
| HTTP endpoints that change other users (`/users/**`) | [05 Admin Management](./05-admin-management.md) |
| Table DDL, constraints, migrations | [08 Database](./08-database.md) |
| Session revocation | [04](./04-session-management.md) |

## Objective

Give every account a clear identity, state and role set, and enforce authorization **server-side**, from the database, on every request.

## Code

| Component | Path |
|---|---|
| Role enum + order | `src/modules/roles/role.enum.ts` |
| Hierarchy / checks | `src/modules/roles/roles.service.ts` |
| Status enum | `src/modules/users/enums/user-status.enum.ts` |
| Domain types | `src/modules/users/types/user.types.ts` |
| Service / repository | `src/modules/users/users.service.ts`, `users.repository.ts` |
| Response mapper | `src/modules/users/mappers/user.mapper.ts` |
| Authorization | `src/modules/auth/decorators/roles.decorator.ts`, `decorators/auth.decorator.ts`, `guards/roles.guard.ts` |

## Roles

| Role | Capabilities |
|---|---|
| `USER` | own profile, own sessions, standard authenticated routes |
| `ADMIN` | **all USER capabilities** + list/inspect users, change status, assign/remove roles, revoke sessions (epic 05) |

Hierarchy: `ADMIN ⊇ USER` (constant map in `RolesService`). A future role is one enum value, one migration (`ALTER TYPE user_role ADD VALUE`) and one hierarchy entry, with no redesign.

## Account status

| Status | Can log in / refresh / call APIs |
|---|---|
| `ACTIVE` | yes |
| `INACTIVE`, `SUSPENDED` | no → `403 AUTH_ACCOUNT_NOT_ACTIVE` |
| `PENDING_VERIFICATION` | no (reserved for future email verification; never assigned today) |

A status change takes effect **on the next request**, because the access-token check reads the status from the DB every time.

## Requirements

| ID | Requirement |
|---|---|
| FR-ROLE-01..04 | Roles `USER`, `ADMIN`. `@Roles(...)` passes if the user holds **any** listed role after hierarchy expansion. |
| FR-ROLE-05 | `RolesGuard` uses DB roles loaded by `JwtStrategy`, **never** the JWT `roles` claim |
| FR-ROLE-06/07 | Fail closed: `@Roles` without an authenticated user → 401. Mismatch → `403 AUTH_FORBIDDEN`. No `@Roles` → not restricted. |
| FR-ROLE-08 | New accounts receive exactly `[USER]`. `ADMIN` is never assignable through registration. |
| FR-ROLE-09 | Only authorized admin operations can promote/demote (epic 05) |
| FR-ROLE-10 | Tokens may carry roles, but the frontend is never the source of truth |
| FR-ROLE-11 | Every user always holds `USER`. Role updates are normalized to include it. |
| FR-STATUS-01..04 | As in the table above |

## Business rules

1. USER is assigned by default. USER cannot promote itself (no endpoint allows it).
2. An admin cannot remove their own ADMIN role or change their own status (`403 USER_SELF_MODIFICATION_FORBIDDEN`). Since only admins can demote admins, at least one admin always remains.
3. Emails are stored normalized and unique.

## Technical rules

- `UsersService` knows nothing about passwords (it stores an opaque hash), tokens or sessions.
- `passwordHash` is only returned by `findByEmailWithCredentials` (column `select: false`).
- Entities never leave the repository. Responses always go through `toUserResponse()` (allowlist).
- `UsersModule` must never import `AuthModule`. It may import auth guard/decorator **files**, which have no DI cycle, and must import `RolesModule` to use `RolesGuard`.
- Guard usage: `@UseGuards(JwtAuthGuard, RolesGuard)` in that order, or the `@Auth(...roles)` shorthand.

```ts
@Get('admin')
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
getAdminData() { return { message: 'Admin access granted' }; }

@Get('profile')
@Roles(Role.USER, Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
getProfile() {}
```

## Dependencies

- [08](./08-database.md): `users`, `user_roles` tables.
- [01](./01-authentication-and-access.md): `JwtAuthGuard` supplies `request.user` for `RolesGuard`.

## API behaviour

This epic exposes no endpoints of its own. Its rules surface as `403 AUTH_FORBIDDEN`, `403 AUTH_ACCOUNT_NOT_ACTIVE` and `403 USER_SELF_MODIFICATION_FORBIDDEN` on the routes of epics 01, 04 and 05.

## Security considerations

- Authorization is always backend-enforced and DB-based, so a tampered or stale JWT `roles` claim has no effect.
- Removing a role or suspending a user is effective immediately, without waiting for token expiry.

## Acceptance criteria

- [ ] USER passes USER routes and fails ADMIN routes with 403.
- [ ] ADMIN passes ADMIN routes and USER routes (hierarchy).
- [ ] Anonymous requests fail with 401. A `RolesGuard` without `JwtAuthGuard` fails closed.
- [ ] Removing ADMIN in the DB blocks admin routes on the next request, even with a JWT that still says ADMIN.
- [ ] Every stored role set includes USER. Self-demotion and self-status-change are rejected.

## Required tests

| Test | File |
|---|---|
| Hierarchy / `hasAnyRole` | `src/modules/roles/roles.service.spec.ts` |
| Guard logic | `src/modules/auth/guards/roles.guard.spec.ts` |
| RBAC e2e (probe routes, stale claim, fail-closed) | `test/authorization.e2e-spec.ts` |
| UsersService rules (normalization, defaults, self-protection) | `src/modules/users/users.service.spec.ts` |
| Persistence (roles, filters, stats, cascade) | `test/users.repository.e2e-spec.ts`, `src/modules/users/users.repository.spec.ts` |
