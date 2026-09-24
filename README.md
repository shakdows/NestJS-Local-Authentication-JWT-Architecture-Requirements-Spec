# NestJS Local Auth Boilerplate

A reusable NestJS 12 backend with a complete **local** authentication system. It uses email/password, JWT access tokens, rotating refresh tokens, per-device sessions and USER/ADMIN role-based authorization. There is no external identity provider.

The design is specified in [`docs/specs/`](docs/specs/README.md). This README covers running the project.

## Features

- Registration and login with Argon2id password hashing, email normalization, a password policy, and identical responses for an unknown email or a wrong password.
- Short-lived access tokens (15 min) and long-lived refresh tokens (7 d). Each token type has its own HS256 secret.
- **Refresh-token rotation with reuse detection**. Only the SHA-256 hash of each session's current refresh token is stored.
- **Server-side sessions**, one per device. Logout, logout-all and revoke-others take effect immediately, for access tokens too.
- **Roles** `USER` and `ADMIN` (ADMIN includes USER). Authorization is always enforced from the database, never from token claims.
- **Admin user management**: list/search users, stats, change account status, promote/demote, view and revoke a user's sessions.
- Consistent `{ success, data }` / `{ success: false, error }` envelopes with stable error codes.
- Helmet headers, a CORS allowlist, rate limiting, strict DTO validation and Joi-validated configuration that fails fast.

## Requirements

- Node.js ≥ 22 (`.nvmrc`: 24)
- **npm ≥ 11**. npm 10 crashes resolving this dependency tree ("Cannot read properties of null (reading 'edgesOut')"). Use `npx npm@11 install` if your Node ships npm 10.
- PostgreSQL ≥ 15 (`docker compose up -d` provides one with the `auth_dev` and `auth_test` databases)

## Getting started

```bash
npm install
cp .env.example .env              # then replace both JWT secrets: openssl rand -base64 48
docker compose up -d              # or point DATABASE_URL at your own PostgreSQL
npm run migration:run
npm run seed                      # optional: creates SEED_ADMIN_EMAIL as ADMIN
npm run start:dev                 # http://localhost:3000
```

## Scripts

| Script | Purpose |
|---|---|
| `start:dev` / `start:prod` | Run in watch mode / from `dist/` |
| `build`, `typecheck`, `lint`, `format` | Compile, type-check (including tests), oxlint, prettier |
| `test` | Unit tests (Vitest) |
| `test:e2e` | E2E tests against PostgreSQL (`TEST_DATABASE_URL`, default `postgresql://app:app@localhost:5432/auth_test`). The schema is recreated from migrations on each run. |
| `test:cov` | Unit + e2e with coverage thresholds (auth/users: lines ≥ 90%, branches ≥ 85%) |
| `migration:run` / `migration:revert` / `migration:show` / `migration:generate` / `migration:create` | TypeORM migrations (`synchronize` is always off) |
| `seed` | Creates the initial admin (idempotent; refuses to run in production without `--force`) |
| `db:purge-sessions` | Deletes sessions that ended more than 30 days ago (schedule it daily) |

## Configuration

Every variable is validated at startup. The full table is in [AUTH_REQUIREMENTS §3.12](docs/specs/AUTH_REQUIREMENTS.md), and [.env.example](.env.example) lists them all. In production the app refuses to start if:
- a JWT secret is a placeholder, shorter than 32 characters, or the two secrets are equal
- `CORS_ORIGINS` contains `*`
- `DATABASE_LOGGING` is on
- throttling is disabled

## API

The full contract is in [AUTH_API.md](docs/specs/AUTH_API.md).

| Method | Path | Auth |
|---|---|---|
| POST | `/auth/register` | — |
| POST | `/auth/login` | — |
| POST | `/auth/refresh` | refresh token in body |
| POST | `/auth/logout` | access token |
| POST | `/auth/logout-all` | access token |
| GET | `/auth/me` | access token |
| GET | `/auth/sessions` | access token |
| DELETE | `/auth/sessions/:id` | access token |
| POST | `/auth/sessions/revoke-others` | access token |
| GET | `/users`, `/users/stats`, `/users/:id` | ADMIN |
| PATCH | `/users/:id/status`, `/users/:id/roles` | ADMIN |
| GET / DELETE | `/users/:id/sessions` | ADMIN |
| GET | `/health` | — |

Protecting your own routes:

```ts
@Get('admin')
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
getAdminData() { return { message: 'Admin access granted' }; }

@Get('profile')
@Auth(Role.USER)                       // shorthand for the guards + @Roles above
getProfile(@CurrentUser() user: AuthenticatedUser) { … }
```

Remember to import `RolesModule` in any module whose controllers use `RolesGuard`.

## Client token handling

- Keep the access token in memory and the refresh token in secure storage.
- On `401 AUTH_TOKEN_EXPIRED`, call `POST /auth/refresh` **once**, deduplicated across tabs and parallel requests. Replace **both** tokens, then retry.
- Refresh tokens are single-use. Two concurrent refreshes with the same token are treated as token theft, and the session is revoked.
- On `401 AUTH_REFRESH_TOKEN_INVALID`, clear the tokens and send the user to login.

## Production notes

- Serve only over HTTPS. HSTS is enabled when `NODE_ENV=production`.
- Set `TRUST_PROXY` to match your proxy topology, so rate limiting and session IPs use the real client IP.
- The throttler uses in-memory storage, which is only correct for **one instance**. Configure shared storage (e.g. Redis) for multiple instances.
- Run `npm run migration:run` as a deploy step, and schedule `db:purge-sessions`.

## Project layout

```
src/
  config/        typed config namespaces + Joi env validation
  common/        error codes, AppException, filter, interceptor, pipes, decorators
  database/      TypeORM options, CLI data source, migrations, seeds, scripts
  modules/
    auth/        controller, AuthService, PasswordService, TokenService, sessions/, guards/, strategies/, decorators/
    users/       UsersService, UsersRepository, entities, admin controller
    roles/       Role enum, RolesService (hierarchy)
test/            e2e suites + helpers (real PostgreSQL)
docs/specs/      the specification this code implements
```
