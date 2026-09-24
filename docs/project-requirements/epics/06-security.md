# Epic 06 — Security

> **Priority rule:** this epic (together with `docs/specs/AUTH_SECURITY.md`, which holds the full rule list) overrides every other document. If a task conflicts with it, stop and report.

## Responsibility

This epic owns the **cross-cutting security controls** and the list of **forbidden anti-patterns**:

- password hashing policy (algorithm, parameters)
- account-enumeration defenses
- JWT and refresh-token security rules
- rate limiting / brute-force protection
- input validation policy
- HTTP headers, CORS, HTTPS
- logging restrictions and secret handling

## Does Not Own

The *features* these rules protect: epics 01–05. The *configuration values*: epic 10. The *tests* that prove them are listed here, but their infrastructure belongs to epic 09.

## Objective

Make the secure path the default path, so that a correct feature cannot be shipped insecurely.

## Code

| Control | Path |
|---|---|
| Argon2id | `src/modules/auth/services/password.service.ts` |
| Token hashing / constant-time compare | `src/modules/auth/services/token.service.ts` |
| Global validation | `src/common/pipes/validation.pipe.ts` |
| Error sanitizing | `src/common/filters/all-exceptions.filter.ts` |
| Headers, CORS, trust proxy, body limit | `src/app.setup.ts` |
| Rate limiting | `src/app.module.ts` (ThrottlerGuard), `src/modules/auth/auth.constants.ts` (`AUTH_THROTTLE`) |
| Env rules | `src/config/env.validation.ts` |
| Review evidence | `docs/security/AUTH_SECURITY_REVIEW.md` |

## Requirements (MUST)

| Area | Rule |
|---|---|
| Passwords | Argon2id, m ≥ 19456 KiB, t ≥ 2, p ≥ 1. Full PHC string stored. Verify only via `argon2.verify`. Rehash on login when params rise. Never stored, logged or returned. |
| Enumeration | Identical 401 for unknown email / wrong password + dummy verify. Status revealed only after the correct password. Generic refresh errors. |
| JWT | Separate secrets ≥ 32 chars. `algorithms: ['HS256']`. Verify `exp`/`iss`/`aud`/`type`. No default secret. No `decode()` for decisions. Access ≤ 1h. |
| Refresh tokens | Single-use rotation. Store the SHA-256 only. `timingSafeEqual`. **Never bcrypt.** Reuse revokes the session. Accepted only at `/auth/refresh`. ≤ 30d. |
| Sessions | Server-generated ids. Access tokens bound to `sid`. Terminal revocation. Owner-only access (404 for foreign ids). |
| Rate limiting | Global 100/60s per IP. Register 5/min. Login 5/min. Refresh 30/min. `429 RATE_LIMITED` + `Retry-After`. |
| Validation | `whitelist` + `forbidNonWhitelisted` + `transform`. Every string length-bounded. UUID params validated. Parameterized queries. Values never echoed. |
| HTTP | helmet (nosniff, no-referrer, CSP, frame deny); HSTS in production; no `X-Powered-By`; `Cache-Control: no-store`. |
| CORS | Explicit allowlist (`CORS_ORIGINS`), `credentials: false`, `*` rejected in production. Empty = disabled. |
| HTTPS | Production served over HTTPS only (TLS at the edge). |
| Logging | Never log passwords, hashes, full tokens, secrets, `Authorization` headers or request bodies. Security events carry ids only. |
| Secrets | From env only. Only `.env.example` in git. Placeholders rejected in production. |

## Anti-patterns (MUST NOT)

Plaintext or fast-hashed passwords · bcrypt on JWTs · storing raw refresh tokens · one refresh column on `users` · a shared access/refresh secret · un-pinned `alg` · trusting the JWT `roles` claim · long-lived access tokens · non-rotating refresh tokens · different errors for unknown user vs wrong password · logging bodies/headers on auth routes · returning entities · accepting `roles`/`status` on register · business logic in guards · `decode()` for auth · hardcoded/default secrets · `synchronize: true` · CORS `*` · custom crypto · hard account lockout · echoing submitted values · tokens over plain HTTP · `forwardRef` between Auth and Users.

(Full table with rationale: `docs/specs/AUTH_SECURITY.md` §12.)

## Business rules

- Brute force is limited by throttling, **not** account lockout, because lockout would let attackers lock out known emails.
- Authorization is always enforced by the backend. Frontend checks are cosmetic.

## Technical rules

- `THROTTLE_ENABLED=false` exists **only** for functional e2e suites and is rejected in production.
- The throttler uses in-memory storage, which is only valid for a single instance. Multi-instance deployments need shared storage (Redis).
- `TRUST_PROXY` must match the real proxy hops, or rate limits and IPs are wrong or spoofable.

## Dependencies

Applies to every epic. Consumes epic 10 for configuration values.

## Known gaps (SHOULD, deferred)

| Gap | Mitigation today |
|---|---|
| Login throttle per IP + email (FR-S-06) | per-IP limit of 5/min |
| Shared throttler storage | documented; single instance only |

## Acceptance criteria

- [ ] Every MUST item in `docs/specs/AUTH_SECURITY.md` §13 is PASS in `docs/security/AUTH_SECURITY_REVIEW.md`.
- [ ] `npm audit --omit=dev` shows no high/critical issues.
- [ ] No test was weakened to accommodate a change.

## Required tests

| Control | File |
|---|---|
| Hashing | `src/modules/auth/services/password.service.spec.ts` |
| Enumeration | `test/auth-login.e2e-spec.ts` |
| Token forgery (alg none, cross-secret, tampered) | `test/auth-jwt.e2e-spec.ts`, `test/auth-refresh.e2e-spec.ts` |
| Reuse detection / logging without tokens | `src/modules/auth/sessions/sessions.service.spec.ts` |
| Mass assignment, no echo | `test/auth-register.e2e-spec.ts` |
| Headers, CORS, malformed JSON | `test/app.e2e-spec.ts` |
| Rate limits | `test/throttle.e2e-spec.ts` |
| Env rules | `src/config/env.validation.spec.ts` |
| Error sanitizing | `src/common/filters/all-exceptions.filter.spec.ts` |
