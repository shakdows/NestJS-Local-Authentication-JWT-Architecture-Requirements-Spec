# Authentication Security Review (Phase 13)

| Field | Value |
|---|---|
| Scope | `src/**` against [AUTH_SECURITY.md](../specs/AUTH_SECURITY.md) §12 (anti-patterns) and §13 (checklist) |
| Date | 2026-09-24 |
| Result | **All MUST items PASS**. Two SHOULD items deferred (listed in §4). |
| Test evidence | `npm run test:cov` → 250 tests (unit + e2e on PostgreSQL 16), thresholds met |

## 1. Checklist (AUTH_SECURITY §13)

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Passwords never logged, persisted in plaintext or returned | PASS | Only `PasswordService` handles plaintext (`src/modules/auth/services/password.service.ts`). Logger calls carry event/ids only (`auth.service.ts`, `sessions.service.ts`). `test/auth-register.e2e-spec.ts` asserts that the DB hash is argon2id and doesn't contain the password, and that no response mentions `password`. `user.mapper.spec.ts` checks the allowlist. |
| 2 | No JWT `decode(` for decisions; HS256 pinned | PASS | `grep decode( src` → none. `algorithms: ['HS256']` in `jwt.strategy.ts` and `jwt-refresh.strategy.ts`. The `alg:none` e2e case in `test/auth-jwt.e2e-spec.ts` is rejected. |
| 3 | No default JWT secret; secrets distinct and validated | PASS | `JwtModule.register({})` in `auth.module.ts`. Every sign call passes its secret (`token.service.ts`). Joi rules in `env.validation.ts` (min 32, distinct, no placeholders in production), tested in `env.validation.spec.ts`. The cross-secret e2e cases are rejected. |
| 4 | Refresh: hash stored, CAS rotation, reuse revokes, generic 401 | PASS | `sessions.repository.ts#rotate` (`WHERE refresh_token_hash = current`). `sessions.service.ts#validateForRefresh`. `test/auth-refresh.e2e-spec.ts` covers rotation chain, reuse, concurrent refresh, forged `jti`, expired/revoked/wrong type, all returning `AUTH_REFRESH_TOKEN_INVALID`. |
| 5 | Logout / logout-all revoke immediately, including access tokens | PASS | `JwtStrategy` checks the session on every request. `test/auth-logout.e2e-spec.ts` shows `/auth/me` returns 401 right after logout and other devices are unaffected. |
| 6 | Unknown email vs wrong password byte-identical | PASS | `test/auth-login.e2e-spec.ts` compares bodies without `timestamp`. The dummy argon2 verify is covered in `auth.service.spec.ts` and `password.service.spec.ts`. |
| 7 | RolesGuard fails closed; hierarchy tested | PASS | `roles.guard.ts` returns 401 without a user and 403 on mismatch. `test/authorization.e2e-spec.ts` covers a misconfigured route without `JwtAuthGuard` (401), ADMIN passing a USER route, and a stale JWT `roles` claim being ignored. Admin self-modification is forbidden (`test/users-admin.e2e-spec.ts`). |
| 8 | Throttling on register/login/refresh returns 429 | PASS | `test/throttle.e2e-spec.ts`: 429 `RATE_LIMITED` with `Retry-After`. |
| 9 | helmet, CORS allowlist, body limit, `Cache-Control: no-store` | PASS | `src/app.setup.ts` and the interceptor/filter. `test/app.e2e-spec.ts` checks headers, the CORS allow/deny cases and malformed JSON returning 400. |
| 10 | `.env.example` placeholders only; no secrets in git | PASS | `git ls-files` → only `.env.example` among env files. The test secrets in `test/setup/test-env.ts` are marked fake. |
| 11 | `npm audit` clean (high/critical) | PASS | `npm audit --omit=dev` → 0 vulnerabilities. |
| 12 | Errors contain no stack traces, SQL or submitted values | PASS | `all-exceptions.filter.spec.ts` (unknown error → generic 500, no message leak). The validation pipe uses `value: false`, and the register e2e asserts the password is not echoed. |

## 2. Anti-patterns (AUTH_SECURITY §12)

| AP | Status | Where enforced |
|---|---|---|
| AP-01/02 plaintext / fast password hashes | Avoided | argon2id, `password.service.ts` |
| AP-03/04 bcrypt on tokens / raw refresh tokens stored | Avoided | SHA-256 + `timingSafeEqual`, `token.service.ts`. Column `refresh_token_hash char(64)`. |
| AP-05 single refresh column on users | Avoided | `auth_sessions` table |
| AP-06 shared secret | Avoided | two secrets + `type` claim |
| AP-07 un-pinned alg | Avoided | `algorithms: ['HS256']` |
| AP-08 trusting JWT roles | Avoided | DB roles via `SessionsRepository.findActiveIdentity` |
| AP-09 long-lived access tokens | Avoided | 15 m default, Joi max 1 h |
| AP-10 non-rotating refresh tokens | Avoided | CAS rotation + reuse detection |
| AP-11 enumeration via login errors | Avoided | identical 401 + dummy verify |
| AP-12 logging bodies/headers | Avoided | no request logger; security events use ids only |
| AP-13 returning entities | Avoided | mappers (`toUserResponse`, `toSessionResponse`); `select: false` on hash columns |
| AP-14 mass assignment | Avoided | `whitelist` + `forbidNonWhitelisted` (tested) |
| AP-15 business logic in guards | Avoided | strategies call one service method each |
| AP-16 `decode()` | Avoided | none in `src` |
| AP-17 default secrets | Avoided | required Joi vars; no `?? 'secret'` fallbacks |
| AP-18 `synchronize: true` | Avoided | `database.options.ts` hard-codes `false`; `schema:log` shows no drift |
| AP-19 permissive CORS | Avoided | allowlist; `*` rejected in production |
| AP-20 custom crypto | Avoided | `argon2`, `node:crypto`, `jsonwebtoken` via `@nestjs/jwt` |
| AP-21 hard lockout | Avoided | throttling only |
| AP-22 echoing values | Avoided | `validationError.value: false`, static messages |
| AP-23 HTTP in production | Operational | HSTS in production. TLS termination must be at the edge (README). |
| AP-24 `forwardRef` | Avoided | `grep forwardRef src` → none |

## 3. Additional observations

- **Invalid ids never reach SQL**: non-UUID `sid`/`sub` claims are rejected before querying (`sessions.service.ts`), so malformed tokens get a 401, not a 500 (tested).
- **LIKE injection**: the admin `search` filter escapes `%`, `_` and `\` (`users.repository.ts#escapeLike`, tested with `_o%`).
- **Seed script** refuses production without `--force`, validates credentials with the registration policy, and never prints the password.
- **Error log** for unhandled exceptions records `message` + `stack` only. TypeORM query parameters are not logged.

## 4. Follow-ups (SHOULD, deferred)

| Item | Risk | Recommendation |
|---|---|---|
| FR-S-06 login throttle per IP + email | Distributed brute force against one account is limited only per IP | Add a `ThrottlerGuard` subclass with `getTracker = ip + normalized email` on `/auth/login` |
| FR-S-10 OpenAPI | None (documentation) | Add `@nestjs/swagger` when the frontend work starts |
| Multi-instance rate limiting | In-memory throttler storage is per process | Configure Redis storage before horizontal scaling (README) |
