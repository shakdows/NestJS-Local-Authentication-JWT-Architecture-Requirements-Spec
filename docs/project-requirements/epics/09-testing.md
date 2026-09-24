# Epic 09 — Testing

## Responsibility

This epic owns **how correctness is proven**:

- test strategy (unit vs e2e) and conventions
- test infrastructure (configs, global setup, helpers, test environment)
- the cross-epic test matrix
- the coverage gate
- the definition of "done" for any change

## Does Not Own

The *behaviour* under test (each epic lists its own acceptance criteria and required tests). The *security rules* (epic 06).

## Objective

Any agent can change the code and know within minutes whether it broke authentication, authorization or security.

## Code

| Component | Path |
|---|---|
| Unit config | `vitest.config.ts` (project `unit`, `src/**/*.spec.ts`) |
| E2E config | `vitest.config.e2e.ts` (project `e2e`, `test/**/*.e2e-spec.ts`, serial files, global setup) |
| Coverage config | `vitest.config.coverage.ts` (both projects + thresholds) |
| Test environment (fake secrets) | `test/setup/test-env.ts` |
| Schema setup (drop + migrate once) | `test/setup/global-setup.ts` |
| App factory (same pipeline as `main.ts`) | `test/utils/create-test-app.ts` |
| DB reset between tests | `test/utils/reset-database.ts` |
| Auth helpers (register, login, grantAdmin, setStatus) | `test/utils/auth-helpers.ts` |
| Token forging (expired, alg none, custom claims) | `test/utils/token-forge.ts` |

## Strategy

| Level | Scope | Rules |
|---|---|---|
| Unit | services, guards, mappers, config, filters | collaborators mocked; no DB; fast |
| E2E | real HTTP via Supertest against the full `AppModule` + real PostgreSQL | same global pipe/filter/interceptor/guards as production; DB truncated between tests |

## Requirements

| ID | Requirement |
|---|---|
| NFR-05 | Services unit-testable with mocks. Every endpoint covered by e2e on PostgreSQL. |
| NFR-06 | Coverage for `src/modules/auth/**` and `src/modules/users/**`: lines ≥ 90%, branches ≥ 85% (enforced; `npm run test:cov` fails otherwise) |
| Plan rule 8 | Test names include requirement IDs where one applies (e.g. `FR-REFRESH-05: …`) |

## Test matrix (all implemented)

| Area | Cases | Suite |
|---|---|---|
| Registration | valid, duplicate (case/whitespace), concurrent duplicate, invalid email, weak password ×6, mass assignment | `auth-register.e2e-spec.ts` |
| Login | valid, wrong password, unknown user (identical body), inactive ×3, inactive + wrong password, no policy on login, validation, last_login_at, sessions | `auth-login.e2e-spec.ts` |
| JWT | valid, missing, expired, tampered, garbage, refresh secret, alg none, refresh as bearer, wrong type/iss/aud, bad sid, foreign sid, revoked/expired session, suspended, deleted user | `auth-jwt.e2e-spec.ts` |
| Refresh | valid, rotation chain, reuse, per-session containment, concurrency, expired token/session, revoked, cross-type, forged jti, malformed input, extra fields, suspended, new roles | `auth-refresh.e2e-spec.ts` |
| Logout / sessions | current revoked, other devices alive, double logout, logout-all, isolation, list, delete own/foreign/revoked/bad id, revoke-others, first reason wins | `auth-logout.e2e-spec.ts` |
| Authorization | USER route, anonymous, ADMIN route, hierarchy, invalid role, stale claim, runtime grant, fail closed | `authorization.e2e-spec.ts` |
| Admin | access control on every route, list/filter/validate, stats, detail, status (incl. self), roles (incl. self), user sessions | `users-admin.e2e-spec.ts` |
| Persistence | round trip, hash selection, duplicates, lowercase check, cascade, filters, stats, role replace | `users.repository.e2e-spec.ts` |
| Pipeline | health, 404 envelope, helmet, CORS allow/deny, malformed JSON | `app.e2e-spec.ts` |
| Rate limits | login, register, refresh → 429 + Retry-After | `throttle.e2e-spec.ts` |

## Business rules

- A change is **done** only when lint, typecheck, build, unit, e2e and coverage all pass.
- Never skip, disable or weaken a test to get green. Never lower thresholds to make a change pass.

## Technical rules

- E2E needs PostgreSQL at `TEST_DATABASE_URL` (default `postgresql://app:app@localhost:5432/auth_test`). The global setup **drops and recreates** that schema, so never point it at real data.
- Functional suites run with `THROTTLE_ENABLED=false`. `throttle.e2e-spec.ts` turns it on and restores it afterwards.
- Produce expired tokens by signing with a past `exp` (`forgeExpired`), never by sleeping.
- Test secrets in `test/setup/test-env.ts` are fake. Never add real credentials to fixtures.
- Vitest does not type-check, so run `npm run typecheck` (it covers `test/` too).

## Commands

```bash
npm test               # unit
npm run test:e2e       # e2e (PostgreSQL)
npm run test:cov       # unit + e2e + thresholds
npm run typecheck && npm run lint
```

## Dependencies

Exercises every epic. Requires the database from epic 08 and the configuration from epic 10.

## Acceptance criteria

- [ ] `npm run test:cov` exits 0 (currently 253 tests; ~98% lines, ~87% branches overall).
- [ ] Every new requirement or bug fix comes with a test in the right suite.
- [ ] The threshold gate is real: raising a threshold above actual coverage makes the run fail.

## Security considerations

Tests assert the negative cases (no hash in responses, no token in logs, no value echo), not just happy paths. Keep them when refactoring.
