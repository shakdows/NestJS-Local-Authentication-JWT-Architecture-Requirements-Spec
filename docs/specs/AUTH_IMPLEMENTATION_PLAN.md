# Authentication Implementation Plan

| Field | Value |
|---|---|
| Document | AUTH_IMPLEMENTATION_PLAN |
| Status | Ready for execution after the pending decisions in §4 are confirmed (or accepted as defaulted) |
| Audience | An AI coding agent or developer implementing the specs in this folder |
| Related | All documents in [docs/specs](./README.md) |

## 1. Rules for the implementing agent

1. **Read all seven specs first.** If a spec is ambiguous or contradicts another, stop and report it. Never invent an architectural decision. The precedence order is in [README](./README.md).
2. **Work phase by phase, in order.** Do not start phase N+1 until phase N's acceptance criteria and tests pass.
3. **One commit (or PR) per phase**, message `feat(auth): phase N — <title>`. Each commit leaves the app building, linting and passing all tests.
4. **Run after every phase:** `npm run lint`, `npm run build`, `npm test`, and from Phase 4 on `npm run test:e2e`.
5. **Never weaken a security rule** (AUTH_SECURITY) to make a test pass.
6. **Never edit a migration that has already run.** Add a new migration.
7. **Do not implement OPTIONAL features** (AUTH_REQUIREMENTS §6). SHOULD features go in the phase that lists them. If you defer one, write it in §3 *Deviations*.
8. **Name tests after requirement IDs** where one applies, e.g. `it('FR-REFRESH-05: revokes the session when a rotated token is reused')`.
9. Keep the `Baseline` (§2) and `Deviations` (§3) tables current. They are the audit trail.

## 2. Baseline (fill in during Phase 1)

| Item | Spec default | Detected | Decision |
|---|---|---|---|
| Node.js | ≥ 22 LTS (`.nvmrc` = 24) | 22.22 in the build container | `engines.node >= 22`, `.nvmrc` 24 |
| Package manager | npm | npm 10.9 crashes on the Nest 12 tree (`edgesOut` bug) | npm, with `engines.npm >= 11` |
| NestJS | 12.x, Express | `@nestjs/cli` 12.0.5 scaffold → `@nestjs/core` 12.1.0 | kept as scaffolded: **ESM** (`"type": "module"`, `.js` import suffixes), TypeScript 6 |
| ORM / DB | TypeORM 1.x / PostgreSQL ≥ 15 | typeorm 1.1.1, PostgreSQL 16 | as spec |
| Validation | class-validator + class-transformer | 0.15.1 / 0.5.1 | as spec |
| Config | @nestjs/config + Joi | 12.0.1 / 18.2.9 | as spec |
| Tests | Jest + Supertest | the Nest 12 scaffold ships **Vitest** + Supertest | kept the scaffold (plan rule: keep generated test config) |
| Lint | ESLint + Prettier | the Nest 12 scaffold ships **oxlint** + Prettier | kept the scaffold |
| Folder layout | `src/modules/*` (AUTH_ARCHITECTURE §5) | none | as spec |
| Existing auth code | none at spec time | none | built from scratch |

At spec time (2026-09-24) the repository was empty, so every row defaulted to the spec value.

## 3. Deviations log

| Phase | Spec says | Implemented | Reason | Approved by |
|---|---|---|---|---|
| — | Roles `USER`, `ADMIN`, `SUPER_ADMIN`; admin endpoints SHOULD | Roles `USER`, `ADMIN`; admin user management MUST (FR-ADMIN) | Product decision during implementation; specs updated | Product owner |
| 1 | Jest, ESLint | Vitest, oxlint | Nest 12 CLI defaults; plan rule 1.3 says keep them | Agent (rule) |
| 1 | `.env.test` file (git-ignored) | Test env in `test/setup/test-env.ts`, injected via Vitest `env` | A git-ignored file would make tests fail on fresh clones. The values are clearly fake. | Agent |
| 1, 4 | Route throttles always on | `THROTTLE_ENABLED` switch (default `true`, rejected in production) | Functional e2e suites make many requests from one IP; throttling has its own suite | Agent |
| 1 | Body limit via `useBodyParser` in addition to defaults | Same, plus `Cache-Control: no-store` on **all** responses | Safe superset of SEC-HTTP-06 for a JSON API | Agent |
| 2 | Entities via glob | Explicit `ENTITIES` / `MIGRATIONS` arrays | Identical behaviour under Nest, the TypeORM CLI (tsx, ESM) and tests | Agent |
| 5–8 | Four phases with interim code (temporary `sid`, user-by-`sub` lookup) | Implemented directly in final form, in one commit | Interim code would have been written only to be deleted; every test those phases require exists | Agent |
| 8 | `findActiveSessionForAccess` returns `{ session, user }` | Returns a `SessionIdentity` (ids, email, status, DB roles) from one raw join | Avoids coupling SessionsRepository to UsersRepository's mapper; still one query | Agent |
| 10 | Session endpoints in `SessionsController` calling `SessionsService` | Added `UserSessionsService` between them | Keeps ownership checks and response mapping out of both controllers and the core service | Agent |
| 11 | `UsersController` calls `UsersService` | Added `UsersAdminService` for response mapping and pagination | Keeps the controller thin and `UsersService` free of DTOs | Agent |
| 11 | `seed-super-admin.ts` via tsx | `seed-admin.ts`, run from the compiled build (`npm run seed`) | tsx does not emit decorator metadata, which Nest DI needs | Agent |
| 12 | Coverage with Jest | `vitest.config.coverage.ts` (unit + e2e projects); DTOs, entities, enums and types excluded | v8 counts decorator metadata as branches in declarative files | Agent |
| 12 | FR-S-06 login throttle per IP + email (SHOULD) | **Deferred**; per-IP limits are enforced | Needs a custom throttler tracker; not required for MUST scope | Agent (deferral) |
| 12 | FR-S-10 Swagger/OpenAPI (SHOULD) | **Deferred** | Adds a dependency and DTO annotations; AUTH_API.md is the contract for now | Agent (deferral) |

## 4. Pending decisions (confirm before or during Phase 1)

Each decision has a **default**. If nobody answers, the agent implements the default and records it in §3.

| # | Decision | Default in these specs | Alternatives |
|---|---|---|---|
| D-01 | ORM | TypeORM 1.x | Prisma 7.x (swap only `*.repository.ts`, entities → `schema.prisma`, `database/`) |
| D-02 | Package manager | npm | pnpm |
| D-03 | Guard application | Explicit `@UseGuards(JwtAuthGuard[, RolesGuard])` / `@Auth()` | Global `JwtAuthGuard` + `RolesGuard` with a `@Public()` opt-out (secure-by-default) |
| D-04 | Refresh token transport | JSON body | HttpOnly cookie (recommended for browser-only clients; JWT_SPEC §8) |
| D-05 | Duplicate email on register | `409 AUTH_EMAIL_ALREADY_EXISTS` (explicitly requested) | Uniform `202` + email (needs email verification, OPT-01) |
| D-06 | Register issues tokens? | No, register returns `{ user }` only; client then logs in | Auto-login: register returns the login payload |
| D-07 | Reuse detection scope | Revoke the **affected session** only | Revoke **all** sessions of the user |
| D-08 | Concurrent refresh | Strict: a lost race = reuse → session revoked | Grace window (e.g. 10 s) returning the already-rotated pair |
| D-09 | Default status on register | `ACTIVE` | `PENDING_VERIFICATION` once email verification exists |
| D-10 | Role hierarchy | `ADMIN ⊇ USER` (confirmed: roles are USER and ADMIN only) | Flat roles (exact match only) |
| D-11 | Roles storage | `user_roles` join table with a Postgres enum | Enum array column on `users`; full `roles` table |
| D-12 | Password policy | 8–128 chars, ≥ 1 letter + ≥ 1 digit, ≠ email | NIST-style 12+ chars without composition rules; breached-password check |
| D-13 | Refresh lifetime | `7d` sliding | `30d`; add an absolute cap (OPT-13) |
| D-14 | JWT algorithm | HS256 | RS256/EdDSA when other services must verify tokens |
| D-15 | Access checks per request | DB lookup of session + user + roles on every authenticated request | Stateless access tokens (revocation only at expiry). Caching (OPT-12). |

---

## 5. Phases

Legend: **C** = create, **M** = modify. Paths are relative to the repo root.

### Phase 1 — Analyze current project and bootstrap

**Goal:** confirm the baseline. If the repo is still empty, scaffold a NestJS project with the shared infrastructure every later phase needs.

| | |
|---|---|
| **Dependencies (npm)** | `@nestjs/cli` (dev, via `npx`), `@nestjs/config`, `joi`, `class-validator`, `class-transformer`, `helmet`, `@nestjs/throttler` |
| **Depends on** | — |

**Steps**

1. Inspect `package.json`, lockfiles, `nest-cli.json`, `tsconfig*.json`, `src/**`, `test/**`, `.env*`, ORM config, existing auth/user modules. Fill in §2.
2. If existing auth code is found, list each file as *reuse / adapt / replace* with a reason in §2. Stop and ask before replacing anything that is not a security violation.
3. If empty: `npx @nestjs/cli@12 new . --package-manager npm --strict --skip-git`. Keep the generated lint/format/test config.

**Files**

| Op | Path | Content |
|---|---|---|
| C | `.nvmrc`, `.env.example`, `.env.test` (git-ignored, fake secrets), `docker-compose.yml` (postgres:16, dev + test DBs) | |
| M | `.gitignore` | `.env`, `.env.*`, `!.env.example` |
| C | `src/config/{app,auth,jwt}.config.ts`, `src/config/env.validation.ts`, `src/config/duration.util.ts` (+ spec) | Namespaces and Joi schema for **all** variables in AUTH_REQUIREMENTS §3.12, including cross-field rules (secrets differ, refresh > access, max lifetimes, no `*` CORS in production, placeholder rejection in production) |
| C | `src/common/constants/error-codes.ts` | `ErrorCode` enum = AUTH_API §2.4 |
| C | `src/common/exceptions/app.exception.ts` | `AppException(status, code, message, details?)` |
| C | `src/common/filters/all-exceptions.filter.ts` | Error envelope. Maps Nest `HttpException` statuses to generic codes. Throttler → `RATE_LIMITED`. Unknown → `INTERNAL_ERROR` and log the stack. |
| C | `src/common/interceptors/response-envelope.interceptor.ts` | `{ success: true, data }`. Adds `Cache-Control: no-store` for `/auth` paths. |
| C | `src/common/pipes/validation.pipe.ts` | `createValidationPipe()` with the SEC-VAL-01/06 options and an `exceptionFactory` producing `VALIDATION_FAILED` + `details` |
| C | `src/common/decorators/client-context.decorator.ts`, `src/common/types/client-context.type.ts` | `{ ipAddress: req.ip ?? null, userAgent: truncate(req.get('user-agent'), 512) }` |
| C | `src/app.setup.ts` | `configureApp(app)`: helmet, CORS allowlist, global prefix, `trust proxy`, JSON limit `100kb`, `enableShutdownHooks()` |
| M | `src/main.ts` | Bootstrap only: create, `configureApp`, listen on `app.port` |
| M | `src/app.module.ts` | `ConfigModule.forRoot({ isGlobal: true, load: [...], validationSchema, validationOptions: { abortEarly: false } })`, `ThrottlerModule.forRootAsync`, `APP_PIPE`, `APP_FILTER`, `APP_INTERCEPTOR`, `APP_GUARD(ThrottlerGuard)` |
| C | `test/utils/create-test-app.ts`, `test/jest-e2e.json` | Builds the app from `AppModule` + `configureApp` |
| M | Remove the scaffold's `AppController`/`AppService` hello-world (or keep as `GET /health` returning `{ status: 'ok' }`) | |

**Acceptance criteria**
- The app refuses to start when `JWT_ACCESS_SECRET` is missing, shorter than 32 chars, or equal to `JWT_REFRESH_SECRET`.
- An unknown route returns the error envelope with `404 RESOURCE_NOT_FOUND`.
- Response headers include helmet defaults. `X-Powered-By` is absent.

**Tests required**
- Unit: `env.validation` (valid env passes. Each invalid rule fails with the variable name). `duration.util` (`15m`→900, `7d`→604800, invalid → throws). `AllExceptionsFilter` (AppException, HttpException, unknown error, no stack in body). `ResponseEnvelopeInterceptor`.
- E2E: `GET /does-not-exist` → 404 envelope. Helmet header present.

**Security considerations:** no default values for secrets anywhere. `.env.test` holds obviously fake 32+ char secrets. Verify `git status` shows no `.env`.

---

### Phase 2 — User data model

**Goal:** persistence for users and roles, plus `RolesModule`.

| | |
|---|---|
| **Dependencies (npm)** | `@nestjs/typeorm`, `typeorm`, `pg` |
| **Depends on** | Phase 1 |

| Op | Path |
|---|---|
| C | `src/config/database.config.ts`, `src/database/database.module.ts`, `src/database/data-source.ts` |
| C | `src/modules/roles/{roles.module.ts, roles.service.ts, role.enum.ts}` (+ `roles.service.spec.ts`) |
| C | `src/modules/users/enums/user-status.enum.ts` |
| C | `src/modules/users/entities/{user.entity.ts, user-role.entity.ts}` |
| C | `src/modules/users/types/user.types.ts`, `src/modules/users/utils/normalize-email.ts` (+ spec) |
| C | `src/modules/users/users.repository.ts`, `src/modules/users/users.service.ts` (+ specs), `src/modules/users/users.module.ts` |
| C | `src/modules/users/dto/user-response.dto.ts`, `src/modules/users/mappers/user.mapper.ts` (+ spec) |
| C | `src/database/migrations/<ts>-InitUsersAndRoles.ts` (`user_status`, `user_role` enums, `users`, `user_roles` with all constraints from AUTH_DATABASE §3.1–3.2) |
| M | `src/app.module.ts` (import `DatabaseModule`, `UsersModule`, `RolesModule`), `package.json` (migration scripts), `docker-compose.yml` |

**Behaviour:** `UsersService` implements every method in AUTH_ARCHITECTURE §6.2 except the SHOULD admin ones (`list`, `updateStatus`, `setRoles`, which are added in Phase 11). `create` inserts user + roles in one transaction and maps `uq_users_email` violations to `AUTH_EMAIL_ALREADY_EXISTS`. `RolesService` implements `expand` and `hasAnyRole` with the hierarchy.

**Acceptance criteria**
- `npm run migration:run` then `migration:revert` both succeed on an empty DB.
- `findById` / `findByEmail` never return `passwordHash`. Only `findByEmailWithCredentials` does.
- Inserting `User@Example.com` stores `user@example.com`. A direct SQL insert of an uppercase email fails the check constraint.

**Tests required**
- Unit: `normalizeEmail`. `toUserResponse` (output keys are exactly the UserResponse keys: snapshot test asserting no `passwordHash`). `RolesService` (ADMIN passes USER. USER fails ADMIN. Empty required list → true). `UsersService` with a mocked repository (normalizes before lookup, maps the unique violation).
- Integration (e2e DB): repository create/find round trip. Duplicate email → `AUTH_EMAIL_ALREADY_EXISTS`. Cascade delete of roles.

**Security considerations:** `password_hash` `select: false`. `synchronize: false`. Parameterized queries only.

---

### Phase 3 — Password hashing

| | |
|---|---|
| **Dependencies (npm)** | `argon2` |
| **Depends on** | Phase 1 |

| Op | Path |
|---|---|
| C | `src/modules/auth/services/password.service.ts` (+ spec) |
| C | `src/modules/auth/auth.module.ts` (skeleton providing `PasswordService`) |
| C | `src/modules/auth/auth.constants.ts` (password regex, limits) |

**Behaviour:** AUTH_ARCHITECTURE §6.3. Params come from `auth.config`. `onModuleInit` precomputes the dummy hash. `verify` returns `false` (never throws) for a malformed hash.

**Acceptance criteria:** hashes start with `$argon2id$` and embed the configured `m`, `t`, `p`. Two hashes of the same password differ.

**Tests required (unit):** hash/verify round trip. Wrong password → false. Malformed hash → false. `needsRehash` true after a param change. `verifyDummy` resolves `false` and calls argon2 verify once. PHC string contains the configured params. Unit tests use lowered params via config override for speed; one test asserts production defaults.

**Security considerations:** SEC-HASH-01…05. No logging inside the service.

---

### Phase 4 — Registration

| | |
|---|---|
| **Depends on** | Phases 2, 3 |

| Op | Path |
|---|---|
| C | `src/modules/auth/dto/register.dto.ts` (+ custom `NotEqualToEmail` validator in `src/modules/auth/validators/not-equal-to-email.validator.ts`) |
| C | `src/modules/auth/dto/auth-response.dto.ts` (`RegisterResponseDto`) |
| C | `src/modules/auth/auth.errors.ts` |
| C | `src/modules/auth/auth.service.ts` (`register`), `src/modules/auth/auth.controller.ts` (`POST /auth/register`, `@Throttle`) |
| M | `src/modules/auth/auth.module.ts` (import `UsersModule`), `src/app.module.ts` (import `AuthModule`) |
| C | `test/auth.e2e-spec.ts`, `test/utils/reset-database.ts` |

**Behaviour:** AUTH_ARCHITECTURE §8.1, AUTH_API §3.1.

**Acceptance criteria:** `201` with `{ success, data: { user } }`. The user row has an argon2id hash and role `USER`, status `ACTIVE`. No session row is created.

**Tests required**
- Unit (`AuthService.register`): existing email → 409. Hashes before create. Passes `roles: [USER]`, `status: ACTIVE`.
- E2E: **valid registration** · **duplicate email** (also with different case/whitespace) · **invalid email** · **weak password** (too short, no digit, no letter, equals email, > 128) · extra fields `roles`/`status` → 400 · response never contains `password`/`passwordHash` · concurrent duplicate registrations → one 201, one 409.

**Security considerations:** mass-assignment (SEC-VAL-01). Validation details never echo the password (SEC-VAL-06). Throttle.

---

### Phase 5 — Login (credential validation)

| | |
|---|---|
| **Depends on** | Phase 4 |

| Op | Path |
|---|---|
| C | `src/modules/auth/dto/login.dto.ts` |
| M | `src/modules/auth/auth.service.ts` (`validateCredentials`, `login` skeleton) |
| M | `src/modules/auth/auth.controller.ts` (`POST /auth/login`, `@HttpCode(200)`, `@Throttle`, `@ClientContext()`) |

**Behaviour:** AUTH_ARCHITECTURE §8.2 up to "status check". In this phase `login` returns `{ user }` only. Phase 6 adds tokens and Phase 8 adds sessions. Also rehash-on-login (FR-S-05) and `updateLastLoginAt`.

**Acceptance criteria:** unknown email and wrong password produce identical bodies (ignoring `timestamp`). Non-active user with the correct password → 403.

**Tests required**
- Unit: unknown email calls `verifyDummy`. Wrong password → 401. Status check happens only after the password check (non-active + wrong password → 401, not 403). `needsRehash` path.
- E2E: **valid credentials** · **incorrect password** · **non-existent user** · **inactive user** (each of `INACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION` → 403) · email case-insensitivity · body equality between the two 401 cases.

**Security considerations:** SEC-ENUM-01…03. Login must not enforce the password policy (FR-PWD-04).

---

### Phase 6 — JWT access tokens

| | |
|---|---|
| **Dependencies (npm)** | `@nestjs/jwt` |
| **Depends on** | Phase 5 |

| Op | Path |
|---|---|
| C | `src/modules/auth/interfaces/jwt-payload.interface.ts` |
| C | `src/modules/auth/services/token.service.ts` (+ spec). `signAccessToken`, `accessTokenTtlSeconds` in this phase. |
| M | `src/modules/auth/auth.module.ts` (`JwtModule.register({})`) |
| M | `src/modules/auth/auth.service.ts` (`login` returns `accessToken`, `tokenType`, `expiresIn`. Use a temporary `sid = randomUUID()`. Phase 8 replaces it with a real session.) |

**Acceptance criteria:** decoded access token has exactly the claims in JWT_SPEC §3.1, `alg: HS256`, `exp - iat` = configured TTL.

**Tests required (unit):** claim set is exact (no extra keys such as `password`). Signed with the access secret (verifying with the refresh secret fails). TTL from config.

**Security considerations:** SEC-JWT-01, 04, 05.

---

### Phase 7 — JWT guard, current user, `/auth/me`

| | |
|---|---|
| **Dependencies (npm)** | `@nestjs/passport`, `passport`, `passport-jwt`, `@types/passport-jwt` (dev) |
| **Depends on** | Phase 6 |

| Op | Path |
|---|---|
| C | `src/modules/auth/strategies/jwt.strategy.ts` |
| C | `src/modules/auth/guards/jwt-auth.guard.ts` (+ spec for `handleRequest` mapping) |
| C | `src/modules/auth/decorators/current-user.decorator.ts` |
| C | `src/modules/auth/types/authenticated-user.type.ts` |
| M | `src/modules/auth/auth.controller.ts` (`GET /auth/me`), `auth.service.ts` (`getProfile`) |

**Behaviour:** JWT_SPEC §3.4. **Interim:** until Phase 8, step 4 loads the user by `sub` via `UsersService.findById` instead of the session lookup. Phase 8 MUST replace this, and a `TODO(phase-8)` comment marks the spot.

**Acceptance criteria:** `/auth/me` works with a valid token and returns a fresh DB profile.

**Tests required**
- E2E **JWT: valid token** → 200 · **invalid token** (tampered signature, signed with the refresh secret, `alg: none`, `type: refresh`, wrong `iss`/`aud`) → 401 `AUTH_TOKEN_INVALID` · **expired token** (sign with `exp` in the past using the test secret) → 401 `AUTH_TOKEN_EXPIRED` · missing header → 401 `AUTH_TOKEN_MISSING` · user set to `SUSPENDED` after login → 403.
- Unit: `JwtAuthGuard.handleRequest` maps each Passport `info` case.

**Security considerations:** SEC-JWT-02, 03, 06, 08.

---

### Phase 8 — Authentication sessions

| | |
|---|---|
| **Depends on** | Phase 7 |

| Op | Path |
|---|---|
| C | `src/modules/auth/sessions/entities/auth-session.entity.ts`, `sessions/enums/session-revoked-reason.enum.ts` |
| C | `src/modules/auth/sessions/sessions.repository.ts`, `sessions/sessions.service.ts` (+ specs) |
| C | `src/database/migrations/<ts>-CreateAuthSessions.ts` (AUTH_DATABASE §3.3, incl. partial index and check constraint) |
| M | `src/modules/auth/services/token.service.ts` (`signRefreshToken`, `hashRefreshToken`, `compareRefreshTokenHash`) |
| M | `src/modules/auth/auth.service.ts` (`issueSession`, private `createSession`/`generateTokens`. Login returns the full AUTH_API §3.2 payload.) |
| M | `src/modules/auth/strategies/jwt.strategy.ts` (replace the interim lookup with `findActiveSessionForAccess`) |
| M | `src/modules/auth/auth.module.ts` (`TypeOrmModule.forFeature([AuthSessionEntity])`, export `SessionsService`) |

**Acceptance criteria:** each login creates a session row with the hash of the returned refresh token, `expires_at` = the refresh token's `exp`, ip and user agent stored. Two logins = two sessions. Access tokens carry the real `sid`.

**Tests required**
- Unit: `hashRefreshToken` is 64 lowercase hex chars and deterministic. `compareRefreshTokenHash` true/false and length-mismatch safe. `SessionsService.create`/`findActiveSessionForAccess`.
- E2E: login twice → 2 sessions. The DB never contains the raw refresh token (`SELECT` and assert it is not equal to the token, and equal to its SHA-256). Manually revoking the session row → `/auth/me` returns 401 `AUTH_TOKEN_INVALID`.

**Security considerations:** SEC-TOKEN-02/03/04, SEC-SESS-01/02.

---

### Phase 9 — Refresh-token rotation

| | |
|---|---|
| **Depends on** | Phase 8 |

| Op | Path |
|---|---|
| C | `src/modules/auth/dto/refresh-token.dto.ts`, `src/modules/auth/types/refresh-context.type.ts` |
| C | `src/modules/auth/strategies/jwt-refresh.strategy.ts`, `src/modules/auth/guards/jwt-refresh.guard.ts` (+ spec) |
| M | `sessions.service.ts` (`validateForRefresh`, `rotate`), `sessions.repository.ts` (compare-and-swap UPDATE) |
| M | `auth.service.ts` (`refreshTokens`), `auth.controller.ts` (`POST /auth/refresh`, `@UseGuards(JwtRefreshGuard)`, `@Throttle`) |

**Behaviour:** JWT_SPEC §4.4 and §6.

**Acceptance criteria:** RT1 → RT2 works. RT1 afterwards fails and kills the session (RT2 then fails too). The session id stays the same across rotations and `expires_at` moves forward.

**Tests required (E2E)**
- **valid refresh token** → 200, new pair, both differ from the old ones.
- **rotation behaviour**: RT1 → RT2 → RT3 chain works. DB hash changes each time. `sid` unchanged.
- **token reuse attempt**: use RT1 twice → second call 401 **and** the session is revoked with `REUSE_DETECTED` **and** RT2 now fails **and** access tokens of that session fail.
- **expired token** → 401 (sign with a past `exp` using the refresh test secret).
- **revoked token** (after logout, or after a manual revoke) → 401.
- access token used as refresh token → 401. Refresh token used as bearer → 401.
- missing `refreshToken` → 401 `AUTH_REFRESH_TOKEN_INVALID`.
- concurrent refreshes with the same RT → exactly one 200, and the session ends revoked (strict policy D-08).
- user suspended → 403 and session revoked.
- Unit: `validateForRefresh` branches. `rotate` returns false on 0 affected rows. The guard maps every failure to `AUTH_REFRESH_TOKEN_INVALID` except `AUTH_ACCOUNT_NOT_ACTIVE`.

**Security considerations:** SEC-TOKEN-01, 05, 06, 07. The reuse log line contains no token material (assert with a logger spy).

---

### Phase 10 — Logout and session revocation

| | |
|---|---|
| **Depends on** | Phase 9 |

| Op | Path |
|---|---|
| C | `src/modules/auth/dto/logout-response.dto.ts` |
| M | `sessions.service.ts` / `sessions.repository.ts` (`revoke`, `revokeAllForUser`, `revokeAllExcept`) |
| M | `auth.service.ts` (`logout`, `logoutAll`), `auth.controller.ts` (`POST /auth/logout`, `POST /auth/logout-all`) |
| C (SHOULD) | `src/modules/auth/sessions/sessions.controller.ts`, `sessions/dto/session-response.dto.ts` (`GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/sessions/revoke-others`) |
| C (SHOULD) | `test/sessions.e2e-spec.ts` |

**Acceptance criteria:** after logout, both the refresh token and the access token of that session are rejected immediately. Other sessions keep working. Logout-all kills all of them.

**Tests required (E2E)**
- **current session revoked**: logout → `/auth/me` with the same access token 401, `/auth/refresh` with its RT 401. A second device's session still works.
- **revoked refresh token cannot be reused** after logout.
- logout-all with 3 sessions → `revokedSessions: 3`, all tokens dead.
- `revokeAllExcept` (unit, and e2e via `revoke-others` if implemented) keeps only the current one.
- SHOULD: `GET /auth/sessions` marks `current`, never exposes hashes. `DELETE` on another user's session → 404.
- Revocation keeps the first reason (revoking twice does not overwrite).

**Security considerations:** SEC-SESS-02, 03, 04.

---

### Phase 11 — Roles and authorization

| | |
|---|---|
| **Depends on** | Phase 10 |

| Op | Path |
|---|---|
| C | `src/modules/auth/decorators/roles.decorator.ts`, `src/modules/auth/guards/roles.guard.ts` (+ spec) |
| C (SHOULD) | `src/modules/auth/decorators/auth.decorator.ts` (`@Auth(...roles)`) |
| M | `src/modules/auth/auth.module.ts` (import `RolesModule`, export `JwtAuthGuard`, `RolesGuard`) |
| C (SHOULD) | `src/modules/users/users.controller.ts` (`GET /users`), `users/dto/list-users-query.dto.ts`. `UsersService.list`. `UsersModule` imports `RolesModule`. |
| C (SHOULD) | `src/database/seeds/seed-super-admin.ts`, npm script `seed` |
| C (SHOULD) | `test/users.e2e-spec.ts` |

**Acceptance criteria:** `@Roles(Role.ADMIN)` on `GET /users` allows ADMIN, denies USER with 403, denies anonymous with 401. A role granted in the DB takes effect on the next request without a new login.

**Tests required**
- Unit `RolesGuard`: no metadata → allow · no user → 401 · matching role → allow · hierarchy → allow · non-matching → 403 `AUTH_FORBIDDEN`.
- E2E **authenticated user** (USER on a USER route → 200) · **unauthenticated user** → 401 · **valid role** (ADMIN on `GET /users`; ADMIN on a `@Roles(USER)` route) → 200 · **invalid role** (USER on `GET /users`) → 403 · role removed in the DB → next request 403 even though the JWT `roles` claim still says ADMIN.
- Seed: running twice creates one user.

**Security considerations:** FR-ROLE-05/06 (DB roles, fail closed). No endpoint lets a user change their own roles.

---

### Phase 12 — Tests, coverage and hardening

| | |
|---|---|
| **Depends on** | Phases 1–11 |

| Op | Path |
|---|---|
| M | `package.json` / Jest config: coverage thresholds for `src/modules/auth/**` and `src/modules/users/**` (lines 90%, branches 85%) |
| C | Throttling e2e (`test/throttle.e2e-spec.ts`) with lowered limits via env override |
| C (SHOULD) | `@nestjs/swagger` setup in `app.setup.ts` (non-production), `@ApiProperty`/`@ApiResponse` on DTOs/controllers |
| C (SHOULD) | Session purge script (`src/database/scripts/purge-sessions.ts`, npm `db:purge-sessions`) |
| M | `README.md`: setup, env table, scripts, client token-handling guidance (JWT_SPEC §10), multi-instance throttler note |

**Acceptance criteria:** the complete test matrix in §6 is green. Coverage thresholds pass in CI. `npm run lint` is clean.

**Tests required:** everything in §6 that is not already implemented. Throttling: 6th login within 60 s → 429 with `Retry-After`.

**Security considerations:** tests use fake secrets only. No real credentials in fixtures.

---

### Phase 13 — Security review

| | |
|---|---|
| **Depends on** | Phase 12 |

**Steps:** work through the AUTH_SECURITY §13 checklist and the §12 anti-pattern table. Run `npm audit --omit=dev`. Grep for `console.log`, `decode(`, `synchronize: true`, `process.env` outside config and `data-source.ts`, and `password` in logger calls.

| Op | Path |
|---|---|
| C | `docs/security/AUTH_SECURITY_REVIEW.md`: each checklist item → PASS/FAIL + evidence (file:line or test name) + follow-ups |

**Acceptance criteria:** every MUST item PASS. Any FAIL is fixed in this phase or explicitly accepted by a human in §3.

---

## 6. Test matrix

| Area | Case | Level | Expected | Phase |
|---|---|---|---|---|
| Registration | valid registration | e2e | 201, user without hash, role USER, status ACTIVE | 4 |
| Registration | duplicate email (same / different case / whitespace) | e2e | 409 `AUTH_EMAIL_ALREADY_EXISTS` | 4 |
| Registration | concurrent duplicate | e2e | one 201, one 409 (never 500) | 4 |
| Registration | invalid email | e2e | 400 `VALIDATION_FAILED`, `details[].field = email` | 4 |
| Registration | weak password (short, no digit, no letter, = email, > 128) | e2e | 400, password not echoed | 4 |
| Registration | mass assignment (`roles`, `status`) | e2e | 400 | 4 |
| Login | valid credentials | e2e | 200, tokens, session row | 5, 8 |
| Login | incorrect password | e2e | 401 `AUTH_INVALID_CREDENTIALS` | 5 |
| Login | non-existent user | e2e | 401, body identical to the wrong-password case | 5 |
| Login | inactive user (INACTIVE / SUSPENDED / PENDING_VERIFICATION) | e2e | 403 `AUTH_ACCOUNT_NOT_ACTIVE` | 5 |
| Login | inactive user + wrong password | e2e | 401 (status not revealed) | 5 |
| JWT | valid token | e2e | 200 on `/auth/me` | 7 |
| JWT | invalid token (tampered, wrong secret, `alg:none`, wrong type/iss/aud) | e2e | 401 `AUTH_TOKEN_INVALID` | 7 |
| JWT | expired token | e2e | 401 `AUTH_TOKEN_EXPIRED` | 7 |
| JWT | missing token | e2e | 401 `AUTH_TOKEN_MISSING` | 7 |
| JWT | session revoked | e2e | 401 `AUTH_TOKEN_INVALID` | 8 |
| Refresh | valid refresh token | e2e | 200 new pair | 9 |
| Refresh | expired token | e2e | 401 `AUTH_REFRESH_TOKEN_INVALID` | 9 |
| Refresh | revoked token | e2e | 401 | 9, 10 |
| Refresh | token reuse attempt | e2e | 401 + session revoked (`REUSE_DETECTED`) + newer RT dead | 9 |
| Refresh | rotation behaviour (chain, hash changes, `sid` stable) | e2e | as described | 9 |
| Refresh | concurrent refresh | e2e | one 200, session revoked | 9 |
| Refresh | wrong token type | e2e | 401 | 9 |
| Authorization | authenticated user | e2e | 200 | 11 |
| Authorization | unauthenticated user | e2e | 401 | 11 |
| Authorization | valid role (incl. hierarchy) | e2e | 200 | 11 |
| Authorization | invalid role | e2e | 403 `AUTH_FORBIDDEN` | 11 |
| Authorization | role revoked in DB, stale JWT claim | e2e | 403 | 11 |
| Logout | current session revoked (access + refresh dead, other device alive) | e2e | as described | 10 |
| Logout | revoked refresh token cannot be reused | e2e | 401 | 10 |
| Logout | logout-all | e2e | all sessions revoked | 10 |
| Security | no `passwordHash` in any response | e2e | key absent everywhere | 4–11 |
| Security | raw refresh token never in DB | e2e | only the SHA-256 is stored | 8 |
| Security | throttling | e2e | 429 + `Retry-After` | 12 |
| Security | no secrets/tokens in logs | unit | logger spy assertions | 9, 13 |

**Test infrastructure**
- E2E runs against a real PostgreSQL (`docker compose up -d postgres-test`) using `.env.test`. Global setup runs migrations. `reset-database.ts` truncates `auth_sessions, user_roles, users` between test files (`TRUNCATE … RESTART IDENTITY CASCADE`).
- E2E uses the default Argon2 params (they equal the Joi minimums, so they cannot be lowered through env). Unit tests of `PasswordService` MAY construct it with lower params directly for speed. Run e2e with `--runInBand` to avoid DB contention.
- Expired tokens are produced by signing with the test secret and an explicit past `exp`, never by sleeping.

## 7. Definition of done

- All MUST requirements implemented and traced to tests. SHOULD items implemented or listed in §3.
- Phases 1–13 committed. CI green (lint, build, unit, e2e, coverage).
- `docs/security/AUTH_SECURITY_REVIEW.md` complete with every MUST item PASS.
- README explains setup, env vars, migrations, seeding and client token handling.
