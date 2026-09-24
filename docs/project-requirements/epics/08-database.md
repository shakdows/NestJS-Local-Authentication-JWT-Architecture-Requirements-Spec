# Epic 08 — Database

## Responsibility

This epic owns the **persistent schema**:

- tables, columns, enum types, constraints and indexes (with their exact names)
- relationships and cascade behaviour
- migrations (creation, order, reversibility)
- the TypeORM data source and entity/migration registries
- data retention (session purge SQL)

## Does Not Own

| Concern | Owner |
|---|---|
| What the data *means* for authorization (roles, status) | [02](./02-users-and-roles.md) |
| Session lifecycle semantics (when rows are revoked and why) | [04](./04-session-management.md) |
| Running migrations/purge in environments | [10](./10-deployment-and-operations.md) |

## Objective

A schema that enforces integrity **in the database itself** (unique normalized emails, revocation consistency), managed exclusively by reviewed migrations.

## Code

| Component | Path |
|---|---|
| Shared TypeORM options | `src/database/database.options.ts` (`synchronize: false`) |
| Nest wiring | `src/database/database.module.ts` |
| CLI data source | `src/database/data-source.ts` |
| Registries | `src/database/entities.ts`, `src/database/migrations/index.ts` |
| Migrations | `src/database/migrations/1790000000000-InitUsersAndRoles.ts`, `1790000000001-CreateAuthSessions.ts` |
| Entities | `src/modules/users/entities/*.entity.ts`, `src/modules/auth/sessions/entities/auth-session.entity.ts` |
| Purge | `src/database/scripts/purge-sessions.ts` |

## Schema

```
users 1──* user_roles          (PK user_id+role, FK cascade)
users 1──* auth_sessions       (FK cascade)
```

**Enum types:** `user_status` (ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION), `user_role` (USER, ADMIN), `session_revoked_reason` (LOGOUT, LOGOUT_ALL, LOGOUT_OTHERS, REUSE_DETECTED, USER_NOT_ACTIVE, ADMIN_REVOKED).

**`users`:** `id uuid PK default gen_random_uuid()`, `email varchar(254)`, `password_hash varchar(255)`, `status user_status default ACTIVE`, `last_login_at timestamptz null`, `created_at`, `updated_at`.

**`user_roles`:** `user_id uuid`, `role user_role`, `created_at`.

**`auth_sessions`:** `id uuid PK (app-generated)`, `user_id uuid`, `refresh_token_hash char(64)`, `expires_at timestamptz`, `revoked_at timestamptz null`, `revoked_reason session_revoked_reason null`, `last_used_at timestamptz null`, `ip_address varchar(45) null`, `user_agent varchar(512) null`, `created_at`, `updated_at`.

| Constraint / index | Definition |
|---|---|
| `pk_users`, `pk_user_roles`, `pk_auth_sessions` | primary keys |
| `uq_users_email` | `UNIQUE(email)`. The repository maps its violation to `409 AUTH_EMAIL_ALREADY_EXISTS`. |
| `ck_users_email_lowercase` | `CHECK (email = lower(email))` |
| `idx_users_status` | `(status)` |
| `fk_user_roles_user` | `→ users(id) ON DELETE CASCADE` |
| `idx_user_roles_role` | `(role)` |
| `fk_auth_sessions_user` | `→ users(id) ON DELETE CASCADE` |
| `uq_auth_sessions_refresh_token_hash` | `UNIQUE(refresh_token_hash)` |
| `ck_auth_sessions_revocation` | `CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))` |
| `idx_auth_sessions_user_active` | `(user_id) WHERE revoked_at IS NULL` (partial) |
| `idx_auth_sessions_expires_at` | `(expires_at)` |

## Requirements

| ID | Requirement |
|---|---|
| NFR-08 | `synchronize` is false everywhere. Schema changes only via migrations. |
| AUTH_DATABASE §7 | Migrations are append-only, each with a working `down()`. Names match the table above exactly. |
| FR-S-07 | Purge sessions that ended more than 30 days ago |

## Business rules

- Emails are unique **after** normalization, and the DB rejects non-lowercase emails.
- Revocation is soft (`revoked_at` + reason) and terminal. No code path sets `revoked_at` back to NULL.
- Deleting a user deletes their roles and sessions.

## Technical rules

- Only `*.repository.ts` files use TypeORM APIs. Entities never leave repositories.
- Enum columns set `enumName` to the exact type names. `password_hash` and `refresh_token_hash` are `select: false`.
- Entities and migrations are registered **explicitly** (no globs), so Nest, the TypeORM CLI (tsx) and tests behave identically.
- After changing an entity, `npx tsx ./node_modules/typeorm/cli.js schema:log -d src/database/data-source.ts` must report "Your schema is up to date".
- Adding an enum value = new migration with `ALTER TYPE … ADD VALUE`.

## Dependencies

Used by epics 02, 04 and 05 through their repositories. Operated by epic 10.

## Security considerations

- Only hashes are stored for secrets (Argon2id for passwords, SHA-256 for refresh tokens).
- `ip_address` / `user_agent` are personal data, purged with the session after retention.
- `DATABASE_LOGGING` must be false in production (query logs could contain hashes).

## Acceptance criteria

- [ ] `migration:run` → `migration:revert` → `migration:run` succeeds on an empty DB.
- [ ] `schema:log` reports no drift between entities and migrations.
- [ ] Constraint names match the table above (`\d users`, `\d auth_sessions`).
- [ ] The purge script deletes only sessions that ended more than 30 days ago.

## Required tests

| Test | File |
|---|---|
| Round trip, lowercase check, cascade, filters, stats | `test/users.repository.e2e-spec.ts` |
| Unique-violation mapping | `src/modules/users/users.repository.spec.ts` |
| Hash-only storage, session rows | `test/auth-login.e2e-spec.ts` |
| Schema from migrations per run | `test/setup/global-setup.ts` (drop + migrate) |
