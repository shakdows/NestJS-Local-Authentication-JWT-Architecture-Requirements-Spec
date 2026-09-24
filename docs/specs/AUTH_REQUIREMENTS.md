# Authentication Requirements

| Field | Value |
|---|---|
| Document | AUTH_REQUIREMENTS |
| Status | Draft for implementation |
| Scope | Local email/password authentication with JWT access tokens, rotating refresh tokens, server-side sessions and role-based authorization |
| Related | [AUTH_ARCHITECTURE](./AUTH_ARCHITECTURE.md) · [AUTH_DATABASE](./AUTH_DATABASE.md) · [JWT_SPEC](./JWT_SPEC.md) · [AUTH_SECURITY](./AUTH_SECURITY.md) · [AUTH_API](./AUTH_API.md) · [AUTH_IMPLEMENTATION_PLAN](./AUTH_IMPLEMENTATION_PLAN.md) |

## 1. Purpose and scope

The boilerplate MUST provide a complete, self-contained authentication system that runs **inside the NestJS backend**:

- Identity is proven with **email + password**. Passwords are hashed with **Argon2id**.
- API requests are authenticated with short-lived **JWT access tokens** (`Authorization: Bearer <token>`).
- Sessions are kept alive with long-lived, **rotating JWT refresh tokens**. Each one is bound to a server-side **authentication session** row (`auth_sessions`).
- Authorization is **role-based** (`USER`, `ADMIN`, `SUPER_ADMIN`).

### 1.1 Out of scope (explicitly)

- External identity providers: Google OAuth, Microsoft, GitHub, Firebase Auth, Auth0, Clerk, Supabase Auth, Cognito, Keycloak, etc.
- Email delivery (verification, password reset), MFA, API keys, service accounts, multi-tenancy. The architecture MUST leave room for these (see §6), but they MUST NOT be implemented now.
- Frontend code.

### 1.2 Terminology

| Term | Meaning |
|---|---|
| **Authentication** | Proving *who* the caller is (login, token validation). |
| **Authorization** | Deciding *what* an authenticated caller may do (roles). |
| **Access token** | Short-lived JWT sent on every protected request. |
| **Refresh token** | Long-lived JWT used **only** on `POST /auth/refresh` to get a new token pair. |
| **Session** | One `auth_sessions` row for one signed-in device or client. It stores the **hash** of that session's current refresh token. |
| **Rotation** | Swapping the current refresh token for a new one on every refresh. The old one becomes unusable. |
| **Reuse** | Presenting a refresh token that was already rotated. This is treated as token theft. |
| **Normalized email** | `email.trim().toLowerCase()`. |

## 2. Requirement levels

- **MUST**: required for the first release. Acceptance tests exist for each one.
- **SHOULD**: expected in the first release unless the team explicitly defers it. Deferrals MUST be written in the implementation plan.
- **OPTIONAL**: future features. The architecture MUST NOT prevent them, but they MUST NOT be implemented now.

---

## 3. Functional requirements: MUST

### 3.1 Registration (`FR-REG`)

| ID | Requirement |
|---|---|
| FR-REG-01 | `POST /auth/register` MUST create a local account from `email` and `password`. |
| FR-REG-02 | The email MUST be normalized (trim + lowercase) before any lookup or storage (see FR-EMAIL). |
| FR-REG-03 | The password MUST satisfy the password policy (FR-PWD) before hashing. |
| FR-REG-04 | The password MUST be hashed with Argon2id (SEC-HASH-01) before persistence. The plaintext MUST NOT be stored, returned or logged. |
| FR-REG-05 | New users MUST get the role `USER` and status `ACTIVE`. Registration input MUST NOT be able to set roles or status (mass-assignment protection). |
| FR-REG-06 | If the normalized email already exists, the API MUST return `409 Conflict` with code `AUTH_EMAIL_ALREADY_EXISTS`. |
| FR-REG-07 | A duplicate caused by a concurrent request (a DB unique-constraint violation) MUST also map to `409 AUTH_EMAIL_ALREADY_EXISTS`, never `500`. |
| FR-REG-08 | Registration MUST return `201 Created` with the public user representation only. It MUST NOT issue tokens or create a session (the client calls `/auth/login` next). |

### 3.2 Login (`FR-LOGIN`)

| ID | Requirement |
|---|---|
| FR-LOGIN-01 | `POST /auth/login` MUST accept `email` and `password`. |
| FR-LOGIN-02 | Credentials MUST be checked by `AuthService.validateCredentials()`: normalize email → find user → verify Argon2 hash. |
| FR-LOGIN-03 | Unknown email and wrong password MUST produce the **same** response: `401 AUTH_INVALID_CREDENTIALS`, message `Invalid email or password`. |
| FR-LOGIN-04 | Response time for unknown email MUST be close to that of a wrong password. The service runs an Argon2 verify against a precomputed dummy hash (SEC-ENUM-02). |
| FR-LOGIN-05 | The account status MUST be checked **only after** the password is verified. Status other than `ACTIVE` → `403 AUTH_ACCOUNT_NOT_ACTIVE`. |
| FR-LOGIN-06 | Successful login MUST create a new `auth_sessions` row, storing the client `ip_address` and `user_agent` (truncated to limits in AUTH_DATABASE). |
| FR-LOGIN-07 | Successful login MUST return `200 OK` with `user`, `accessToken`, `refreshToken`, `tokenType` (`Bearer`) and `expiresIn` (access token lifetime in seconds). |
| FR-LOGIN-08 | Successful login MUST update `users.last_login_at`. |

### 3.3 Password policy (`FR-PWD`)

| ID | Requirement |
|---|---|
| FR-PWD-01 | Registration passwords MUST be 8 to 128 characters long (the upper bound limits hashing DoS). |
| FR-PWD-02 | Registration passwords MUST contain at least one letter and at least one digit. |
| FR-PWD-03 | Registration passwords MUST NOT equal the normalized email (case-insensitive comparison). |
| FR-PWD-04 | Login MUST NOT enforce the policy. It only requires a non-empty string of at most 128 characters. Otherwise the login endpoint would reveal the policy and reject legacy passwords. |
| FR-PWD-05 | Leading and trailing whitespace in passwords MUST be preserved (no trimming). |

### 3.4 Email normalization and validation (`FR-EMAIL`)

| ID | Requirement |
|---|---|
| FR-EMAIL-01 | Emails MUST be trimmed and lowercased in the DTO (`@Transform`) **and** again in `UsersService` (defense in depth). |
| FR-EMAIL-02 | Emails MUST be syntactically valid (`@IsEmail()`) and at most 254 characters. |
| FR-EMAIL-03 | Provider-specific rewriting (removing Gmail dots, `+tag` suffixes) MUST NOT be applied. |
| FR-EMAIL-04 | The database MUST enforce uniqueness on the stored (normalized) email (see AUTH_DATABASE). |

### 3.5 Tokens (`FR-TOKEN`)

| ID | Requirement |
|---|---|
| FR-TOKEN-01 | Access tokens MUST be JWTs signed with `JWT_ACCESS_SECRET`, default lifetime `15m` (`JWT_ACCESS_EXPIRES_IN`). |
| FR-TOKEN-02 | Refresh tokens MUST be JWTs signed with a **different** secret, `JWT_REFRESH_SECRET`, default lifetime `7d` (`JWT_REFRESH_EXPIRES_IN`). |
| FR-TOKEN-03 | Token payloads MUST follow JWT_SPEC exactly and MUST NOT contain passwords, hashes or personal data beyond `email`. |
| FR-TOKEN-04 | A token of one type MUST be rejected where the other type is expected (`type` claim check plus the different secrets). |

### 3.6 Protected endpoints and current user (`FR-GUARD`)

| ID | Requirement |
|---|---|
| FR-GUARD-01 | `JwtAuthGuard` MUST protect routes that need an authenticated user. It uses the `jwt` Passport strategy. |
| FR-GUARD-02 | The `jwt` strategy MUST verify signature, algorithm, `exp`, `iss`, `aud` and `type`. It then MUST load the session (`sid`) and user and reject the request if the session is revoked or expired, or if the user is missing or not `ACTIVE`. |
| FR-GUARD-03 | A missing token MUST return `401 AUTH_TOKEN_MISSING`. A malformed or bad-signature token or a revoked session MUST return `401 AUTH_TOKEN_INVALID`. An expired token MUST return `401 AUTH_TOKEN_EXPIRED`. A non-active user MUST return `403 AUTH_ACCOUNT_NOT_ACTIVE`. |
| FR-GUARD-04 | `@CurrentUser()` MUST return the `AuthenticatedUser` object (`id`, `email`, `roles`, `status`, `sessionId`). `@CurrentUser('id')` MUST return a single property. |
| FR-GUARD-05 | `GET /auth/me` MUST return the current user's public profile, read fresh from the database. |

### 3.7 Refresh (`FR-REFRESH`)

| ID | Requirement |
|---|---|
| FR-REFRESH-01 | `POST /auth/refresh` MUST accept the refresh token in the JSON body field `refreshToken`. |
| FR-REFRESH-02 | `JwtRefreshGuard` / the `jwt-refresh` strategy MUST verify signature, `exp`, `iss`, `aud`, `type = "refresh"`. It MUST then check that the session exists, is not revoked, is not expired, and belongs to `sub`. |
| FR-REFRESH-03 | The SHA-256 hash of the presented token MUST equal the session's current `refresh_token_hash` (constant-time comparison). |
| FR-REFRESH-04 | On success the service MUST **rotate**: issue a new access token and a new refresh token, replace `refresh_token_hash`, extend `expires_at`, update `last_used_at`, in one conditional update (JWT_SPEC §6). |
| FR-REFRESH-05 | A validly signed refresh token whose hash does not match the session's current hash is a **reuse attempt**. The session MUST be revoked (`revoked_reason = REUSE_DETECTED`), a security warning MUST be logged (no token material), and the response MUST be `401 AUTH_REFRESH_TOKEN_INVALID`. |
| FR-REFRESH-06 | Every refresh failure (expired, revoked, unknown session, reuse, bad signature) MUST return the same `401 AUTH_REFRESH_TOKEN_INVALID`, except a non-active user, which returns `403 AUTH_ACCOUNT_NOT_ACTIVE` and also revokes the session. |
| FR-REFRESH-07 | The response MUST have the same token fields as login (`accessToken`, `refreshToken`, `tokenType`, `expiresIn`), without `user`. |

### 3.8 Logout and session revocation (`FR-LOGOUT`)

| ID | Requirement |
|---|---|
| FR-LOGOUT-01 | `POST /auth/logout` MUST require a valid access token and revoke **the current session** (the access token's `sid`), with `revoked_reason = LOGOUT`. |
| FR-LOGOUT-02 | `POST /auth/logout-all` MUST require a valid access token and revoke **every** non-revoked session of the user (`revoked_reason = LOGOUT_ALL`), including the current one. |
| FR-LOGOUT-03 | After revocation, the session's refresh token MUST be rejected by `/auth/refresh`. Access tokens bound to that session MUST be rejected on the next request (FR-GUARD-02). |
| FR-LOGOUT-04 | `SessionsService` MUST provide `revoke(sessionId)`, `revokeAllForUser(userId)` and `revokeAllExcept(userId, currentSessionId)`, even if some are not yet exposed over HTTP. |
| FR-LOGOUT-05 | Logout endpoints MUST be idempotent from the client's view and MUST return `200` with the number of sessions revoked. |

### 3.9 Roles and authorization (`FR-ROLE`)

| ID | Requirement |
|---|---|
| FR-ROLE-01 | Roles MUST be defined by the `Role` enum: `USER`, `ADMIN`, `SUPER_ADMIN`. It lives in `modules/roles/role.enum.ts`. |
| FR-ROLE-02 | A user MAY hold several roles. They are stored in `user_roles` (AUTH_DATABASE). |
| FR-ROLE-03 | `@Roles(...roles)` MUST attach required roles as metadata. `RolesGuard` MUST allow the request if the user holds **any** of the listed roles, after applying the hierarchy (FR-ROLE-04). |
| FR-ROLE-04 | The hierarchy MUST be `SUPER_ADMIN ⊇ ADMIN ⊇ USER`: a `SUPER_ADMIN` passes `@Roles(Role.ADMIN)`. It lives in `RolesService`, not in the guard. |
| FR-ROLE-05 | `RolesGuard` MUST use the roles loaded **from the database** by the `jwt` strategy, never the `roles` claim alone. |
| FR-ROLE-06 | `RolesGuard` MUST fail closed: if `@Roles` is present and there is no authenticated user, deny with `401`. If roles do not match, deny with `403 AUTH_FORBIDDEN`. |
| FR-ROLE-07 | Routes without `@Roles` MUST NOT be restricted by `RolesGuard`. |

### 3.10 Account status (`FR-STATUS`)

| ID | Requirement |
|---|---|
| FR-STATUS-01 | `UserStatus` enum: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION`. |
| FR-STATUS-02 | Only `ACTIVE` users may log in, refresh or pass `JwtAuthGuard`. |
| FR-STATUS-03 | Because the `jwt` strategy checks status on every request, a status change takes effect **immediately**. Status changes need no cross-module call into AuthModule. |
| FR-STATUS-04 | `PENDING_VERIFICATION` is reserved for future email verification. It is not assigned by the MUST scope. |

### 3.11 Error handling (`FR-ERR`)

| ID | Requirement |
|---|---|
| FR-ERR-01 | All errors MUST use the error envelope in AUTH_API §2.2, via one global exception filter. |
| FR-ERR-02 | Every auth error MUST carry a stable machine-readable `code` from the catalogue in AUTH_API §2.4. |
| FR-ERR-03 | Validation errors MUST return `400 VALIDATION_FAILED` with per-field `details`. |
| FR-ERR-04 | Unexpected errors MUST return `500 INTERNAL_ERROR` with a generic message. Stack traces, SQL and secrets MUST NOT appear in responses. |
| FR-ERR-05 | Status codes: `400` validation · `401` authentication failure · `403` authenticated but not allowed / not active · `409` duplicate email · `429` rate limited · `500` unexpected. |

### 3.12 Configuration (`FR-CONF`)

| ID | Requirement |
|---|---|
| FR-CONF-01 | All secrets and tunables MUST come from environment variables loaded through `@nestjs/config` with namespaced `registerAs` factories (`app`, `auth`, `database`, `jwt`). |
| FR-CONF-02 | The environment MUST be validated at startup (Joi). The app MUST refuse to start if a required variable is missing or invalid. |
| FR-CONF-03 | `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` MUST each be at least 32 characters and MUST differ. |
| FR-CONF-04 | A committed `.env.example` MUST list every variable with safe placeholder values. `.env*` files other than `.env.example` MUST be git-ignored. |
| FR-CONF-05 | Code MUST read configuration through typed config namespaces, never `process.env` directly (except in `data-source.ts` for the TypeORM CLI). |

**Environment variables (MUST):**

| Variable | Required | Default | Validation |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `3000` | port number |
| `API_PREFIX` | no | *(empty)* | string without leading/trailing `/` (e.g. `api/v1`) |
| `CORS_ORIGINS` | prod: yes | *(empty = CORS disabled)* | comma-separated list of origins; `*` forbidden in production |
| `TRUST_PROXY` | no | `false` | `false`, `true` or hop count |
| `DATABASE_URL` | yes | — | `postgres://` / `postgresql://` URI |
| `DATABASE_SSL` | no | `false` | boolean |
| `DATABASE_LOGGING` | no | `false` | boolean; MUST be `false` in production |
| `JWT_ACCESS_SECRET` | yes | — | ≥ 32 chars |
| `JWT_ACCESS_EXPIRES_IN` | no | `15m` | `^\d+[smhd]$`, max `1h` (SEC-JWT-07) |
| `JWT_REFRESH_SECRET` | yes | — | ≥ 32 chars, ≠ access secret |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | `^\d+[smhd]$`, must exceed the access lifetime, max `30d` (SEC-TOKEN-08) |
| `JWT_ISSUER` | no | `nestjs-boilerplate` | string |
| `JWT_AUDIENCE` | no | `nestjs-boilerplate-api` | string |
| `AUTH_ARGON2_MEMORY_COST` | no | `19456` (KiB) | int ≥ 19456 |
| `AUTH_ARGON2_TIME_COST` | no | `2` | int ≥ 2 |
| `AUTH_ARGON2_PARALLELISM` | no | `1` | int ≥ 1 |
| `THROTTLE_TTL` | no | `60` (seconds) | int > 0 |
| `THROTTLE_LIMIT` | no | `100` | int > 0 |
| `SEED_SUPER_ADMIN_EMAIL` | no | — | email; used only by the seed script |
| `SEED_SUPER_ADMIN_PASSWORD` | no | — | satisfies FR-PWD; used only by the seed script |

## 4. Functional requirements: SHOULD

| ID | Requirement |
|---|---|
| FR-S-01 | `GET /auth/sessions` SHOULD list the current user's active sessions (id, user agent, IP, created/last-used, `current` flag). |
| FR-S-02 | `DELETE /auth/sessions/:id` SHOULD revoke one of the current user's own sessions (reason `LOGOUT`). Another user's session id MUST return `404`. |
| FR-S-03 | `POST /auth/sessions/revoke-others` SHOULD revoke all sessions except the current one (reason `LOGOUT_OTHERS`). |
| FR-S-04 | `GET /users` (roles: `ADMIN`) SHOULD return a paginated user list. This is the reference example of role-protected endpoints. |
| FR-S-05 | On successful login, if `argon2.needsRehash()` reports outdated parameters, the password SHOULD be re-hashed and saved. |
| FR-S-06 | Login throttling SHOULD key on `IP + normalized email` in addition to IP alone (SEC-RATE-03). |
| FR-S-07 | Expired and revoked sessions SHOULD be purged after a retention period (30 days) by a documented script or scheduled job. |
| FR-S-08 | A seed script SHOULD create an initial `SUPER_ADMIN` from `SEED_SUPER_ADMIN_*`. It is idempotent and refuses to run in production unless `--force` is given. |
| FR-S-09 | An `@Auth(...roles)` composite decorator SHOULD combine `UseGuards(JwtAuthGuard, RolesGuard)` and `Roles(...)`. |
| FR-S-10 | Swagger/OpenAPI docs (`@nestjs/swagger`) SHOULD describe the auth endpoints, with the bearer scheme declared. They are served only outside production unless enabled. |
| FR-S-11 | Security-relevant events (login success/failure, refresh reuse, logout-all) SHOULD be logged as structured entries holding only `userId`, `sessionId`, `ip`, `event`, never tokens or passwords. |

## 5. Non-functional requirements

### 5.1 MUST

| ID | Requirement |
|---|---|
| NFR-01 | **Security**: every rule in AUTH_SECURITY marked MUST. |
| NFR-02 | **Modularity**: dependencies flow `AuthModule → UsersModule → DatabaseModule` and `AuthModule → RolesModule`. `UsersModule` MUST NOT import `AuthModule`. No `forwardRef`. |
| NFR-03 | **Thin controllers**: controllers only bind DTOs, call one service method, and return its result. No repository access, hashing, token signing or branching business rules. |
| NFR-04 | **Persistence isolation**: only `*.repository.ts` classes touch TypeORM `Repository`/`DataSource`. Services depend on repositories. |
| NFR-05 | **Testability**: each service is unit-testable with mocked collaborators. E2E tests cover every endpoint in AUTH_API against a real PostgreSQL database. |
| NFR-06 | **Coverage**: `modules/auth/**` and `modules/users/**` MUST reach at least 90% line coverage and 85% branch coverage. |
| NFR-07 | **Type safety**: TypeScript `strict: true`. No `any` in auth code, except where third-party typings force it (comment required). |
| NFR-08 | **Schema management**: TypeORM `synchronize` MUST be `false` in all environments. Schema changes go through migrations only. |
| NFR-09 | **Performance**: login p95 SHOULD stay below 500 ms on a 2 vCPU host with default Argon2 params. Authenticated request overhead is at most one indexed query (session + user + roles). |
| NFR-10 | **Statelessness of app instances**: no in-memory auth state that breaks horizontal scaling, except the default in-memory throttler storage, which MUST be documented as single-instance only (SEC-RATE-05). |

### 5.2 SHOULD

| ID | Requirement |
|---|---|
| NFR-S-01 | Lint (ESLint) and format (Prettier) SHOULD pass in CI with the Nest CLI default configs. |
| NFR-S-02 | A `docker-compose.yml` SHOULD provide PostgreSQL for local development and e2e tests. |
| NFR-S-03 | Each public service method SHOULD have a short TSDoc comment stating its contract. |

## 6. OPTIONAL future features (not in scope now)

The architecture MUST leave clear extension points for these. None may be implemented in this scope.

| ID | Feature | Extension point that MUST exist now |
|---|---|---|
| OPT-01 | Email verification | `UserStatus.PENDING_VERIFICATION`. Registration status is set in one place (`AuthService.register`). |
| OPT-02 | Forgot / reset password | `PasswordService.hash()` reusable. `SessionsService.revokeAllForUser()` to kill sessions after reset. |
| OPT-03 | MFA (TOTP / WebAuthn) | Login = `validateCredentials()` then `issueSession()`. An MFA step can be placed between the two. |
| OPT-04 | OAuth / social login (Google, Microsoft, GitHub) | `issueSession(user, context)` does not depend on how identity was proven. A future `auth_identities` table plus a nullable `password_hash` (AUTH_DATABASE §7). |
| OPT-05 | API keys / service accounts | New Passport strategy + guard. The `AuthenticatedUser` type can gain a `principalType` discriminator. |
| OPT-06 | Audit log | The structured security events from FR-S-11 can be persisted by a listener. |
| OPT-07 | Device management | `auth_sessions` already stores `user_agent`, `ip_address`, `last_used_at`. |
| OPT-08 | Fine-grained permissions | `RolesService` is the single place that resolves authorization. A `PermissionsGuard` can sit beside `RolesGuard`. |
| OPT-09 | Multi-tenancy | JWT claims can gain `tid`. Sessions can gain `tenant_id`. |
| OPT-10 | HttpOnly cookie transport for refresh tokens | Token extraction is isolated in `jwt-refresh.strategy.ts` (JWT_SPEC §8). |
| OPT-11 | Account lockout after N failures | A counter on `users`. Deferred to avoid a lockout-DoS vector. |
| OPT-12 | Access-token denylist / Redis session cache | `SessionsService.findActiveSessionForAccess()` is the single lookup to cache. |
| OPT-13 | Absolute session lifetime / max sessions per user | Enforced in `SessionsService.create()` / `rotate()`. |

## 7. Traceability

Each requirement ID above is referenced by at least one acceptance criterion or test in [AUTH_IMPLEMENTATION_PLAN.md](./AUTH_IMPLEMENTATION_PLAN.md). Test names SHOULD include the ID, for example `it('FR-LOGIN-03: returns identical 401 for unknown email and wrong password')`.
