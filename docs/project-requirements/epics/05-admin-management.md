# Epic 05 — Admin Management

## Responsibility

This epic owns **administrative operations on other users**, exposed over HTTP to `ADMIN` only:

- `GET /users` (list, filter, paginate), `GET /users/stats`, `GET /users/:id`
- `PATCH /users/:id/status`, `PATCH /users/:id/roles`
- `GET /users/:id/sessions`, `DELETE /users/:id/sessions`
- the initial admin seed (`npm run seed`)

## Does Not Own

| Concern | Owner |
|---|---|
| Role/status definitions, hierarchy, `RolesGuard`, self-modification invariant | [02 Users and Roles](./02-users-and-roles.md) |
| Session revocation mechanics | [04 Session Management](./04-session-management.md) |
| Envelope, pagination shape, error codes | [07 API Contracts](./07-api-contracts.md) |

## Objective

Give administrators the tools behind an admin dashboard: user counts, a searchable user table, account activation/suspension, promotion/demotion and forced sign-out.

## Code

| Component | Path |
|---|---|
| Controller (users) | `src/modules/users/users.controller.ts` (`@Auth(Role.ADMIN)` on the class) |
| Use cases / mapping | `src/modules/users/users-admin.service.ts` |
| Rules | `src/modules/users/users.service.ts` (`list`, `getStats`, `getByIdOrFail`, `updateStatus`, `setRoles`) |
| DTOs | `src/modules/users/dto/{list-users-query,update-user-status,update-user-roles}.dto.ts` |
| Controller (sessions) | `src/modules/auth/sessions/admin-sessions.controller.ts`. It lives in AuthModule so UsersModule never depends on AuthModule. |
| Seed | `src/database/seeds/seed-admin.ts` |

## Requirements

| ID | Requirement |
|---|---|
| FR-ADMIN-01 | `GET /users` with `page` (≥1, default 1), `limit` (1–100, default 20), optional `status`, `role`, `search` (case-insensitive email substring; `%`/`_` escaped) |
| FR-ADMIN-02 | `GET /users/stats` → `{ total, byStatus: {ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION}, byRole: {USER, ADMIN} }` |
| FR-ADMIN-03 | `GET /users/:id` → `{ user }`; unknown → 404 |
| FR-ADMIN-04 | `PATCH /users/:id/status { status }`; effective immediately |
| FR-ADMIN-05 | `PATCH /users/:id/roles { roles }` replaces roles; `USER` is always kept |
| FR-ADMIN-06 | An admin cannot change their own status or remove their own ADMIN role → `403 USER_SELF_MODIFICATION_FORBIDDEN` |
| FR-ADMIN-07 | `GET /users/:id/sessions` lists active sessions; `DELETE /users/:id/sessions` revokes all (`ADMIN_REVOKED`) |
| FR-S-08 | Seed creates `SEED_ADMIN_EMAIL` as `[USER, ADMIN]`; idempotent; refuses production without `--force` |

## Business rules

1. Every `/users/**` route requires a valid access token **and** role `ADMIN`. USER gets 403, anonymous gets 401.
2. Promote: `{ "roles": ["ADMIN"] }` is stored as `[USER, ADMIN]`. Demote: `{ "roles": ["USER"] }`.
3. Self-protection (rule 2 of epic 02) guarantees at least one admin always remains.
4. Suspending/deactivating a user blocks their existing tokens on the next request. Admins may additionally revoke their sessions.
5. Admins may manage other admins (no super-admin tier exists).

## Technical rules

- Route order: `/users/stats` is declared before `/users/:id`, and `:id` uses a UUID pipe (malformed → `400 VALIDATION_FAILED`).
- List queries filter on ids first, then load roles, so each user's full role list is returned.
- Responses use `toUserResponse` (no `passwordHash`) and the admin session DTO (no hashes, no `current` flag).
- The seed runs from the compiled build (`nest build && node dist/...`), because `tsx` does not emit the decorator metadata Nest DI needs.

## Dependencies

- [02](./02-users-and-roles.md): `UsersService` rules, `RolesGuard`, `@Auth`.
- [04](./04-session-management.md): `UserSessionsService.listForUser` / `revokeAllForUser`.

## API behaviour

| Endpoint | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /users` | `page, limit, status, role, search` | `{ items: UserResponse[], meta: { page, limit, total, totalPages } }` | 400, 401, 403 |
| `GET /users/stats` | — | `{ total, byStatus, byRole }` | 401, 403 |
| `GET /users/:id` | — | `{ user }` | 400, 401, 403, 404 |
| `PATCH /users/:id/status` | `{ status }` | `{ user }` | 400, 401, 403 (incl. self), 404 |
| `PATCH /users/:id/roles` | `{ roles }` (1–10 unique `Role`s) | `{ user }` | 400, 401, 403 (incl. self), 404 |
| `GET /users/:id/sessions` | — | `{ items: [{ id, ipAddress, userAgent, createdAt, lastUsedAt, expiresAt }] }` | 400, 401, 403, 404 |
| `DELETE /users/:id/sessions` | — | `{ revokedSessions: n }` | 400, 401, 403, 404 |

Full schemas: `docs/specs/AUTH_API.md` §3.10–3.16.

## Security considerations

- Authorization is checked from DB roles on every call. A demoted admin loses access immediately.
- `search` is parameterized and LIKE-escaped. All bodies are whitelisted, so unknown fields return 400.
- The seed never prints the password and validates it with the registration policy.

## Acceptance criteria

- [ ] USER → 403 and anonymous → 401 on every `/users/**` route.
- [ ] List paginates and filters correctly. Stats match the DB.
- [ ] Suspend → the target's `/auth/me` returns 403 immediately. Reactivate restores access.
- [ ] Promote/demote takes effect on the target's next request.
- [ ] Self status change and self-demotion are rejected with `USER_SELF_MODIFICATION_FORBIDDEN`.
- [ ] Admin session revocation kills the target's tokens and leaves the admin's own session alone.
- [ ] Running the seed twice creates one admin.

## Required tests

| Test | File |
|---|---|
| Full admin matrix | `test/users-admin.e2e-spec.ts` |
| Rules (self-protection, 404) | `src/modules/users/users.service.spec.ts` |
| Filters, stats, role replacement | `test/users.repository.e2e-spec.ts` |
