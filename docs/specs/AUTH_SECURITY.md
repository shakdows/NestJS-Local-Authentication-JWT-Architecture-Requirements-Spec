# Authentication Security Requirements

| Field | Value |
|---|---|
| Document | AUTH_SECURITY |
| Status | Draft for implementation. Takes precedence over every other spec in this folder. |
| References | OWASP ASVS 4.0.3 (V2, V3, V6, V7, V13) · OWASP Password Storage, JWT, Session Management and Authentication Cheat Sheets · NIST SP 800-63B |
| Related | [JWT_SPEC](./JWT_SPEC.md) · [AUTH_DATABASE](./AUTH_DATABASE.md) · [AUTH_API](./AUTH_API.md) |

Every rule here is **MUST** unless marked **SHOULD**.

## 1. Password security (`SEC-HASH`, `SEC-PWD`)

| ID | Rule |
|---|---|
| SEC-HASH-01 | Hash passwords with **Argon2id** using the `argon2` npm package. Defaults: `memoryCost = 19456` KiB, `timeCost = 2`, `parallelism = 1` (OWASP minimum), configurable upward only (Joi minimums enforce this). |
| SEC-HASH-02 | Store the full PHC string returned by `argon2.hash` (it embeds algorithm, params and a random salt). Never store salt or params separately. Never use a static salt. |
| SEC-HASH-03 | Verify only with `argon2.verify(hash, plain)`. Never compare hashes with `===`. Never re-hash and compare. |
| SEC-HASH-04 | If the project already standardizes on **bcrypt**, it MAY stay (cost ≥ 12), but passwords MUST then be capped at 72 **bytes** by validation, not silently truncated. Mixed algorithms are allowed only during a documented migration (verify old, re-hash to new on login). |
| SEC-HASH-05 | Only `PasswordService` touches the hashing library. No custom crypto, no MD5/SHA-x for passwords, no pepper implementation in this scope. |
| SEC-HASH-06 | SHOULD: re-hash on successful login when `argon2.needsRehash(hash, params)` is true (FR-S-05). |
| SEC-PWD-01 | Plaintext passwords exist only in the request DTO and as arguments to `PasswordService`. They are never stored, returned, cached, logged or put in exceptions or error `details`. |
| SEC-PWD-02 | Policy (registration): 8–128 chars, at least one letter and one digit, not equal to the email. Max length also bounds Argon2 work. |
| SEC-PWD-03 | `password_hash` is `select: false` in the entity and excluded by the response mapper allowlist. Two independent safeguards. |

## 2. Account enumeration and credential errors (`SEC-ENUM`)

| ID | Rule |
|---|---|
| SEC-ENUM-01 | Login failures for unknown email and wrong password return **identical** status, code, message and body shape: `401 AUTH_INVALID_CREDENTIALS` / `Invalid email or password`. |
| SEC-ENUM-02 | Unknown-email login still performs one Argon2 verify against a dummy hash computed at startup with the live params, so response timing does not reveal whether the account exists. |
| SEC-ENUM-03 | Account status (`403 AUTH_ACCOUNT_NOT_ACTIVE`) is revealed **only after** the correct password is verified. |
| SEC-ENUM-04 | Registration returns `409 AUTH_EMAIL_ALREADY_EXISTS` for duplicates (product decision, see the plan's pending decisions). This does reveal whether an email is registered, so the endpoint MUST be rate limited (SEC-RATE-02). The planned email-verification flow (OPT-01) can later switch this to a uniform `202`. |
| SEC-ENUM-05 | Refresh failures all return one generic `401 AUTH_REFRESH_TOKEN_INVALID`, never the specific reason. |

## 3. JWT security (`SEC-JWT`)

| ID | Rule |
|---|---|
| SEC-JWT-01 | Separate secrets for access (`JWT_ACCESS_SECRET`) and refresh (`JWT_REFRESH_SECRET`), each ≥ 32 characters and different from each other. Validated at boot. |
| SEC-JWT-02 | Pin `algorithms: ['HS256']` on every verification. Never accept `none`. Never take the algorithm from the token. |
| SEC-JWT-03 | Verify `exp`, `iss`, `aud` and the `type` claim on every token. `ignoreExpiration` is always `false`. Clock tolerance ≤ 5 s. |
| SEC-JWT-04 | Payloads contain only the claims in JWT_SPEC. Never passwords, hashes, raw refresh tokens, secrets, or personal data beyond `email`. JWTs are signed, **not encrypted**: anyone holding one can read it. |
| SEC-JWT-05 | `JwtModule` is registered **without** a default secret. Each sign call passes its secret explicitly. |
| SEC-JWT-06 | Authorization decisions use DB state (session, status, roles) loaded per request, never the token's `roles` claim alone. |
| SEC-JWT-07 | Access-token lifetime ≤ 15 min by default. Configurable, but Joi rejects values above `1h`. |
| SEC-JWT-08 | Never use `jwtService.decode()` (no signature check) for any security decision. |

## 4. Refresh-token security (`SEC-TOKEN`)

| ID | Rule |
|---|---|
| SEC-TOKEN-01 | Refresh tokens are single-use and rotated on every refresh (JWT_SPEC §6). |
| SEC-TOKEN-02 | Only the SHA-256 hex hash of the current refresh token is stored (`auth_sessions.refresh_token_hash`). Never the raw token. |
| SEC-TOKEN-03 | Hash comparison uses `crypto.timingSafeEqual`. |
| SEC-TOKEN-04 | **bcrypt MUST NOT be used to hash refresh tokens (or any JWT).** Its 72-byte input truncation makes different JWTs with a shared header/payload prefix hash identically. Argon2 on tokens is also unnecessary. SHA-256 is the required choice. |
| SEC-TOKEN-05 | Rotation is a compare-and-swap UPDATE (`WHERE refresh_token_hash = current`). 0 rows affected ⇒ reuse ⇒ revoke session. |
| SEC-TOKEN-06 | Presenting a rotated token revokes the session (`REUSE_DETECTED`) and emits a security log event. |
| SEC-TOKEN-07 | Refresh tokens are accepted **only** by `POST /auth/refresh`. |
| SEC-TOKEN-08 | Refresh-token lifetime default 7 d, max 30 d (Joi-enforced). |

## 5. Session security (`SEC-SESS`)

| ID | Rule |
|---|---|
| SEC-SESS-01 | Every login creates a new session with a server-generated random UUID. Client-supplied session ids are never accepted. |
| SEC-SESS-02 | Access tokens are bound to their session (`sid`). A revoked or expired session invalidates its access tokens on the next request. |
| SEC-SESS-03 | Revocation is terminal and keeps the first reason (AUTH_DATABASE §5). |
| SEC-SESS-04 | Users can only list and revoke **their own** sessions. Foreign session ids return `404` (not `403`) so the ids cannot be probed. |
| SEC-SESS-05 | A user whose status becomes non-`ACTIVE` is blocked immediately on both access and refresh paths. |
| SEC-SESS-06 | `ip_address` and `user_agent` are stored for the user's own device management only. They are personal data: they are not exposed to other users and are purged with the session (retention 30 d after end, SHOULD). |
| SEC-SESS-07 | SHOULD: future password change or reset MUST call `revokeAllForUser` (or `revokeAllExcept` the current session). |

## 6. Rate limiting and brute-force protection (`SEC-RATE`)

Implemented with `@nestjs/throttler`, with `ThrottlerGuard` registered as a global `APP_GUARD`.

| ID | Route | Limit (per tracker) | Tracker |
|---|---|---|---|
| SEC-RATE-01 | Global default | `THROTTLE_LIMIT` (100) / `THROTTLE_TTL` (60 s) | IP |
| SEC-RATE-02 | `POST /auth/register` | 5 / 60 s | IP |
| SEC-RATE-03 | `POST /auth/login` | 5 / 60 s per IP, and (SHOULD) 10 / 15 min per `IP + normalized email` | IP / IP+email |
| SEC-RATE-04 | `POST /auth/refresh` | 30 / 60 s | IP |
| SEC-RATE-05 | Storage | In-memory storage is single-instance only. Multi-instance deployments MUST configure shared storage (for example the Redis storage for the throttler). Documented in the README. | — |
| SEC-RATE-06 | Behind a proxy | `TRUST_PROXY` MUST be set correctly. Otherwise every client shares the proxy's IP (over-limiting) or clients can spoof `X-Forwarded-For` (bypass). | — |
| SEC-RATE-07 | Response | `429` with code `RATE_LIMITED` and a `Retry-After` header. | — |

Route limits are constants in `auth.constants.ts` (`AUTH_THROTTLE`) applied with `@Throttle({ default: … })`.

Account lockout after N failures is deliberately **not** implemented (OPT-11). A hard lockout lets an attacker lock out any known email. Throttling per IP and per IP+email gives brute-force resistance without that denial-of-service vector.

## 7. Input validation (`SEC-VAL`)

| ID | Rule |
|---|---|
| SEC-VAL-01 | Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Unknown fields such as `roles` or `status` in register → `400`. |
| SEC-VAL-02 | Every DTO field has type **and** length validators (`@IsString()`, `@MaxLength()`, etc.). No unbounded strings. |
| SEC-VAL-03 | JSON body size limit `100kb`. Only `application/json` bodies are accepted on auth routes. |
| SEC-VAL-04 | Route params that are ids use `ParseUUIDPipe`. |
| SEC-VAL-05 | All queries use parameters (TypeORM QueryBuilder parameters / Repository API). No string-concatenated SQL. |
| SEC-VAL-06 | Validation error `details` list field names and constraint messages but **never echo submitted values** (`validationError: { target: false, value: false }`). |

## 8. HTTP security headers, CORS and HTTPS (`SEC-HTTP`)

| ID | Rule |
|---|---|
| SEC-HTTP-01 | `helmet()` enabled in `configureApp()` with defaults: HSTS, `X-Content-Type-Options: nosniff`, frame denial, `Referrer-Policy: no-referrer`, a restrictive CSP (JSON API). |
| SEC-HTTP-02 | HSTS (`max-age ≥ 15552000; includeSubDomains`) in production. |
| SEC-HTTP-03 | CORS: explicit allowlist from `CORS_ORIGINS`. Allowed methods `GET, POST, PATCH, DELETE, OPTIONS`. Allowed headers `Authorization, Content-Type`. `credentials: false` (bearer tokens, not cookies). `*` is rejected in production by env validation. Empty list ⇒ CORS disabled. |
| SEC-HTTP-04 | If cookie transport is added later (OPT-10): `credentials: true`, exact origins only, `SameSite=Strict`, `Secure`, `HttpOnly`, CSRF protection. |
| SEC-HTTP-05 | Production MUST be served over **HTTPS only** (TLS 1.2+), normally terminated at a load balancer or reverse proxy. Plain HTTP MUST redirect or be refused at the edge. Tokens over plain HTTP are a critical finding. |
| SEC-HTTP-06 | Auth responses carry `Cache-Control: no-store` (set by the response interceptor for `/auth/*`). |
| SEC-HTTP-07 | `X-Powered-By` disabled (helmet). |

## 9. Logging restrictions (`SEC-LOG`)

| ID | Rule |
|---|---|
| SEC-LOG-01 | Never log: passwords, password hashes, full access or refresh tokens, refresh-token hashes, JWT secrets, DB URLs with credentials, `Authorization` headers. |
| SEC-LOG-02 | Request/response body logging is disabled for `/auth/*`. If an HTTP logger is added (for example `nestjs-pino`), it MUST redact `req.headers.authorization`, `req.body.password`, `req.body.refreshToken`, `res.body.data.accessToken`, `res.body.data.refreshToken`. |
| SEC-LOG-03 | Allowed identifiers in logs: `userId`, `sessionId`, `jti`, IP, event name, error code. Emails SHOULD be avoided in logs (use `userId`). |
| SEC-LOG-04 | Security events are logged at `warn` (reuse detected, repeated login failures) or `log` (login success, logout-all) with an `event` field such as `auth.login.failed`, `auth.refresh.reuse_detected`. |
| SEC-LOG-05 | `DATABASE_LOGGING` is `false` in production (query logs could contain hashes). |
| SEC-LOG-06 | Stack traces go to logs only, never to API responses. |

## 10. Secrets and configuration (`SEC-CONF`)

| ID | Rule |
|---|---|
| SEC-CONF-01 | Secrets come only from environment variables or a secret manager injecting them. No hardcoded secrets or fallback defaults for secrets in code, tests or Docker files (test secrets live in `.env.test`, clearly fake). |
| SEC-CONF-02 | `.env`, `.env.*` are git-ignored except `.env.example`, which has placeholders such as `change-me-to-a-32+-char-random-string`. |
| SEC-CONF-03 | In production, boot fails if a secret equals a known placeholder from `.env.example`. |
| SEC-CONF-04 | Config objects holding secrets are never logged or serialized into responses (no `/config` debug endpoint). |

## 11. Production requirements checklist

- [ ] HTTPS only, HSTS on.
- [ ] `NODE_ENV=production`, strong unique secrets, `DATABASE_SSL=true` when the DB is remote.
- [ ] `CORS_ORIGINS` set to exact origins.
- [ ] `TRUST_PROXY` matches the real proxy topology.
- [ ] Shared throttler storage if running more than one instance.
- [ ] Migrations applied. `synchronize: false`.
- [ ] Swagger disabled or protected.
- [ ] Session purge scheduled (SHOULD).
- [ ] `npm audit --omit=dev` shows no high/critical issues. Dependencies pinned via lockfile.
- [ ] Seed script not run with default credentials.

## 12. Anti-patterns the implementation MUST avoid

| # | Anti-pattern | Why | Required instead |
|---|---|---|---|
| AP-01 | Storing plaintext or reversibly encrypted passwords | Total compromise on DB leak | Argon2id hash |
| AP-02 | Fast hashes (MD5, SHA-1, SHA-256) for passwords | GPU brute force | Argon2id |
| AP-03 | Hashing refresh tokens/JWTs with bcrypt | 72-byte truncation ⇒ collisions | SHA-256 + timingSafeEqual |
| AP-04 | Storing raw refresh tokens | DB leak = session hijack | Store hash only |
| AP-05 | One refresh token column on `users` | No multi-device, no per-device revocation | `auth_sessions` table |
| AP-06 | Same secret for access and refresh tokens | An access token could be used as a refresh token | Two secrets + `type` claim |
| AP-07 | Accepting the token's `alg` / no `algorithms` pin | `alg: none` / key-confusion attacks | `algorithms: ['HS256']` |
| AP-08 | Trusting `roles` from the JWT for authorization | Stale or escalated privileges | DB roles per request |
| AP-09 | Long-lived access tokens (days) | Big theft window | ≤ 15 min |
| AP-10 | Non-rotating, reusable refresh tokens | Stolen token works until expiry | Rotation + reuse detection |
| AP-11 | Different errors for "user not found" vs "wrong password" | Account enumeration | Identical `401` + dummy verify |
| AP-12 | Logging request bodies or `Authorization` headers on auth routes | Credential leakage into logs | Redaction, no body logging |
| AP-13 | Returning entities directly (`return user`) | `password_hash` leaks | Mapper allowlist → DTO |
| AP-14 | Accepting `roles`/`status` in registration | Privilege escalation via mass assignment | `whitelist` + `forbidNonWhitelisted`, server sets defaults |
| AP-15 | Business logic or DB writes inside guards/strategies | Untestable, hidden side effects | Strategies call one service method |
| AP-16 | `jwtService.decode()` for auth decisions | No signature check | Verify via strategy |
| AP-17 | Hardcoded or default secrets, or `process.env.X ?? 'secret'` | Forgeable tokens | Joi-validated required env |
| AP-18 | `synchronize: true` | Silent schema drift/data loss | Migrations |
| AP-19 | CORS `origin: '*'` with credentials, or reflecting any origin | Cross-site token theft | Allowlist |
| AP-20 | Custom crypto or homemade JWT parsing | Subtle vulnerabilities | Vetted libraries only |
| AP-21 | Hard account lockout on failed logins | Lockout DoS | Throttling |
| AP-22 | Echoing submitted values in validation errors | Leaks passwords into responses/logs | `value: false` |
| AP-23 | Serving tokens over plain HTTP in production | Interception | HTTPS + HSTS |
| AP-24 | `forwardRef` between Auth and Users | Hidden coupling, fragile DI | One-way dependencies |

## 13. Security review checklist (Phase 13)

The reviewer MUST confirm each item, citing a file/line or test name:

1. `grep -R "password" src` shows no logging, no plaintext persistence, and no response inclusion.
2. No `decode(` of JWTs outside tests. Every `verify`/strategy pins `HS256`.
3. `JwtModule.register({})` has no default secret. The two secrets are distinct and validated.
4. Refresh flow: hash stored, compare-and-swap rotation, reuse revokes, generic 401. Tests exist for each.
5. Logout / logout-all revoke sessions and the access token stops working immediately (e2e test).
6. Unknown-email vs wrong-password responses are byte-identical (e2e test compares bodies without `timestamp`).
7. `RolesGuard` fails closed. The SUPER_ADMIN ⊇ ADMIN hierarchy is tested.
8. Throttling on register/login/refresh returns 429 (e2e test with a lowered limit).
9. `helmet`, CORS allowlist, body limit and `Cache-Control: no-store` present.
10. `.env.example` has placeholders only. No secrets in git history.
11. `npm audit` clean at high/critical.
12. Error responses contain no stack traces, SQL or submitted values.
