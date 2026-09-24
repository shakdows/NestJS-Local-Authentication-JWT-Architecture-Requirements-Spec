# Epic 01 — Authentication and Access

## Responsibility

This epic owns **proving who the caller is**, and nothing else:

- public registration (`POST /auth/register`)
- local login (`POST /auth/login`) and credential verification
- resolving the authenticated user for a request (`JwtAuthGuard`, `@CurrentUser()`, `GET /auth/me`)
- the logout use cases (`POST /auth/logout`, `POST /auth/logout-all`)
- the password policy and email normalization rules

## Does Not Own

| Concern | Owner |
|---|---|
| Roles, account status values, authorization (`RolesGuard`) | [02 Users and Roles](./02-users-and-roles.md) |
| Token claims, signing, verification, refresh/rotation | [03 JWT and Tokens](./03-jwt-and-tokens.md) |
| Session persistence, revocation mechanics, device endpoints | [04 Session Management](./04-session-management.md) |
| Admin operations on other users | [05 Admin Management](./05-admin-management.md) |
| Hashing parameters, rate limits, enumeration rules | [06 Security](./06-security.md) |
| Envelope and error-code catalogue | [07 API Contracts](./07-api-contracts.md) |

## Objective

Let anyone create a local account and sign in with email + password, and give every protected route a trustworthy `AuthenticatedUser`.

## Scope

In: register, login, `/auth/me`, logout, logout-all, `JwtAuthGuard`, `@CurrentUser()`.
Out: social login, email verification, password reset, MFA (future; see product context).

## Code

| Component | Path |
|---|---|
| Controller | `src/modules/auth/auth.controller.ts` |
| Orchestrator | `src/modules/auth/auth.service.ts` (`register`, `login`, `validateCredentials`, `issueSession`, `logout`, `logoutAll`, `getProfile`) |
| Password hashing | `src/modules/auth/services/password.service.ts` |
| DTOs | `src/modules/auth/dto/{register,login}.dto.ts`, `dto/email.transform.ts`, `validators/not-equal-to-email.validator.ts` |
| Guard / strategy | `src/modules/auth/guards/jwt-auth.guard.ts`, `strategies/jwt.strategy.ts` |
| Decorator | `src/modules/auth/decorators/current-user.decorator.ts` |
| Errors | `src/modules/auth/auth.errors.ts` |

## Requirements

| ID | Requirement |
|---|---|
| FR-REG-01..08 | Register with `email` + `password`. Normalize email, enforce policy, hash with Argon2id, create `[USER]` / `ACTIVE`, return `201 { user }`. **No tokens and no session.** |
| FR-LOGIN-01..08 | Login verifies credentials, creates a new session, returns user + token pair, updates `last_login_at` |
| FR-PWD-01..05 | Registration password: 8–128 chars, ≥ 1 letter and ≥ 1 digit, ≠ email. Login only checks non-empty and ≤ 128. Whitespace is preserved. |
| FR-EMAIL-01..04 | `trim().toLowerCase()` in the DTO **and** in `UsersService`. Valid email, ≤ 254 chars, no provider rewriting. |
| FR-GUARD-01..05 | `JwtAuthGuard` resolves `AuthenticatedUser { id, email, roles, status, sessionId }`. `/auth/me` reads the profile fresh from the DB. |
| FR-LOGOUT-01/02/05 | Logout revokes the current session. Logout-all revokes every session. Both return `200 { revokedSessions }`. |

## Business rules

1. Public registration always creates `roles = [USER]`, `status = ACTIVE`. Sending `roles`, `status` or `id` returns `400` (mass assignment is rejected).
2. **ADMIN can never be obtained through registration.**
3. A duplicate email (after normalization) returns `409 AUTH_EMAIL_ALREADY_EXISTS`, including under concurrent requests.
4. Unknown email and wrong password produce the **same** `401 AUTH_INVALID_CREDENTIALS` body.
5. Account status is revealed **only after the password is correct**: non-`ACTIVE` returns `403 AUTH_ACCOUNT_NOT_ACTIVE` with `details.status`.
6. Each login creates a new, independent device session.

## Flows (as implemented)

**Registration**
```
request → ValidationPipe(RegisterDto: normalize email, policy) → existsByEmail? → 409
        → PasswordService.hash → UsersService.create([USER], ACTIVE) → 201 { user }
```

**Login**
```
request → ValidationPipe(LoginDto) → findByEmailWithCredentials(normalized)
  ├─ not found → verifyDummy(password) → 401 AUTH_INVALID_CREDENTIALS
  ├─ password mismatch → 401 AUTH_INVALID_CREDENTIALS
  ├─ status ≠ ACTIVE → 403 AUTH_ACCOUNT_NOT_ACTIVE { status }
  └─ ok → rehash if params changed → issueSession() [epic 03 + 04] → update last_login_at
        → 200 { user, accessToken, refreshToken, tokenType, expiresIn }
```

The password is checked **before** the status on purpose, so a suspended account's existence is never revealed without its password.

## Technical rules

- Controllers are thin: bind DTO, make one service call, return. No DB, hashing or signing in controllers.
- `validateCredentials()` lives in `AuthService`. No `passport-local`, because guards run before pipes and credential logic must stay in services.
- `issueSession(user, ctx)` is the **single seam** every identity-proof method must end with (future OAuth/MFA).
- The client IP and user agent come from `@ClientContext()`. The IP honours `TRUST_PROXY`, and the user agent is truncated to 512 chars.

## Dependencies

- [02](./02-users-and-roles.md): `UsersService` (create, lookups, `updateLastLoginAt`, `updatePasswordHash`).
- [03](./03-jwt-and-tokens.md): `TokenService` for signing. `JwtStrategy` claim validation.
- [04](./04-session-management.md): `SessionsService.create`, `revoke`, `revokeAllForUser`, `findActiveSessionForAccess`.

## API behaviour

| Endpoint | Auth | Success | Errors |
|---|---|---|---|
| `POST /auth/register` | — | `201 { user }` | 400, 409, 429 |
| `POST /auth/login` | — | `200 { user, accessToken, refreshToken, tokenType: "Bearer", expiresIn }` | 400, 401, 403, 429 |
| `GET /auth/me` | access token | `200 { user }` | 401 (`MISSING`/`INVALID`/`EXPIRED`), 403 |
| `POST /auth/logout` | access token | `200 { revokedSessions: 1 }` | 401, 403 |
| `POST /auth/logout-all` | access token | `200 { revokedSessions: n }` | 401, 403 |

Full schemas: `docs/specs/AUTH_API.md` §3.1–3.6.

## Security considerations

- The dummy Argon2 verify equalizes timing for unknown emails (SEC-ENUM-02).
- Validation errors never echo the submitted password (SEC-VAL-06).
- Rate limits: register 5/min, login 5/min per IP (epic 06).
- Security events are logged with ids only (`auth.login.failed`, `auth.login.succeeded`, `auth.logout_all`).

## Acceptance criteria

- [ ] Registration creates a USER/ACTIVE account with an argon2id hash and returns no tokens.
- [ ] Duplicate emails (any case/whitespace, concurrent) are rejected with 409, never 500.
- [ ] Passwords are never stored, logged or returned in plaintext.
- [ ] Invalid credentials return a generic, byte-identical 401.
- [ ] Non-active accounts get 403 only with the correct password.
- [ ] `/auth/me` returns the fresh DB profile. A suspended user gets 403 on the next request.
- [ ] Logout kills the current device's access and refresh tokens immediately. Other devices keep working.

## Required tests

| Test | File |
|---|---|
| Registration matrix (valid, duplicate, race, invalid email, weak passwords, mass assignment) | `test/auth-register.e2e-spec.ts` |
| Login matrix (valid, wrong password, unknown user, inactive statuses, status-after-password, validation) | `test/auth-login.e2e-spec.ts` |
| `/auth/me` with valid/invalid/expired/forged tokens | `test/auth-jwt.e2e-spec.ts` |
| Logout / logout-all | `test/auth-logout.e2e-spec.ts` |
| Service units | `src/modules/auth/auth.service.spec.ts`, `services/password.service.spec.ts`, `guards/token-guards.spec.ts` |
