# Epic 03 — JWT and Tokens

## Responsibility

This epic owns **the token model and its cryptography**:

- access-token and refresh-token claims
- signing (secrets, algorithm, expiry) in `TokenService`
- signature/claim verification in `JwtStrategy` and `JwtRefreshStrategy`
- the refresh endpoint `POST /auth/refresh` and the **rotation protocol** (sign new pair → swap)
- mapping token failures to error codes (`JwtAuthGuard`, `JwtRefreshGuard`)

## Does Not Own

| Concern | Owner |
|---|---|
| Where refresh-token hashes live, CAS update, reuse revocation | [04 Session Management](./04-session-management.md) |
| Who may log in / account status | [01](./01-authentication-and-access.md), [02](./02-users-and-roles.md) |
| Secret generation and env validation rules | [10](./10-deployment-and-operations.md) (values), [06](./06-security.md) (rules) |

## Objective

Short-lived, verifiable access tokens for every request. Long-lived, single-use refresh tokens that can only mint new pairs.

## Code

| Component | Path |
|---|---|
| Signing + hashing | `src/modules/auth/services/token.service.ts` |
| Claims | `src/modules/auth/interfaces/jwt-payload.interface.ts` |
| Access verification | `src/modules/auth/strategies/jwt.strategy.ts`, `guards/jwt-auth.guard.ts` |
| Refresh verification | `src/modules/auth/strategies/jwt-refresh.strategy.ts`, `guards/jwt-refresh.guard.ts` |
| Refresh use case | `AuthService.refreshTokens` in `src/modules/auth/auth.service.ts` |
| Config | `src/config/jwt.config.ts` |

## Token model

| | Access token | Refresh token |
|---|---|---|
| Purpose | authenticate every protected request | only `POST /auth/refresh` |
| Transport | `Authorization: Bearer <token>` | JSON body `{ "refreshToken": "..." }` |
| Lifetime | `JWT_ACCESS_EXPIRES_IN` = **15m** (max 1h) | `JWT_REFRESH_EXPIRES_IN` = **7d** (max 30d), sliding per rotation |
| Secret | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` (must differ, ≥ 32 chars) |
| Algorithm | HS256, pinned on verify | HS256, pinned on verify |

**Access payload** (exact):
```json
{ "sub": "<user id>", "email": "<email>", "roles": ["USER"], "sid": "<session id>",
  "type": "access", "iss": "...", "aud": "...", "iat": 0, "exp": 0 }
```

**Refresh payload** (exact):
```json
{ "sub": "<user id>", "sid": "<session id>", "jti": "<random uuid>",
  "type": "refresh", "iss": "...", "aud": "...", "iat": 0, "exp": 0 }
```

`sid` binds tokens to a device session, which makes logout immediate. `type` prevents one token type being used as the other. `jti` makes every refresh token unique. **Never included:** password, passwordHash, raw refresh token, secrets, other personal data.

## Requirements

| ID | Requirement |
|---|---|
| FR-TOKEN-01..04 | Two token types, separate secrets, exact claims, cross-type rejection |
| FR-REFRESH-01..07 | Refresh accepts the body token, validates, rotates, returns `{ accessToken, refreshToken, tokenType, expiresIn }` without `user` |
| SEC-JWT-01..08 | See [06](./06-security.md) |

## Technical rules

- `JwtModule.register({})` has **no default secret**. Every `signAsync` passes its secret explicitly.
- The refresh token's `iat` is set explicitly, so `expiresAt` (stored on the session) equals `exp` exactly.
- Verification order (access): passport-jwt (signature, `HS256`, `exp`, `iss`, `aud`, 5 s clock tolerance), then `type === 'access'`, then session + user lookup (epic 04), then status check.
- Failure mapping (access): no token → `AUTH_TOKEN_MISSING`, expired → `AUTH_TOKEN_EXPIRED`, anything else → `AUTH_TOKEN_INVALID`.
- Failure mapping (refresh): **everything** → `AUTH_REFRESH_TOKEN_INVALID`, except a non-active user → `403 AUTH_ACCOUNT_NOT_ACTIVE`.
- `jwtService.decode()` is never used for decisions.
- Access tokens have no `jti`. Two issued in the same second for the same session may be identical, which is harmless.

## Rotation protocol

```
RT1 → POST /auth/refresh
  JwtRefreshGuard: verify RT1 (refresh secret, type=refresh)
  SessionsService.validateForRefresh(RT1)        [epic 04: session usable? hash current? user active?]
  AuthService.refreshTokens:
     sign AT2 + RT2 (same sid)
     SessionsService.rotate(sid, sha256(RT1) → sha256(RT2))   [epic 04: compare-and-swap]
       0 rows → reuse → revoke session → 401
  → 200 { AT2, RT2 }
RT1 is dead: its hash no longer matches.
```

Guards run before pipes, so a missing or malformed `refreshToken` yields **401**, not 400. Extra body fields still yield 400.

## Dependencies

- [04](./04-session-management.md): session lookup for access tokens, refresh validation, CAS rotation, reuse revocation.
- [02](./02-users-and-roles.md): `UsersService.findById` for the current email/roles when re-signing.

## API behaviour

| Endpoint | Auth | Success | Errors |
|---|---|---|---|
| `POST /auth/refresh` | refresh token in body | `200 { accessToken, refreshToken, tokenType, expiresIn }` | 400 (extra fields), 401 `AUTH_REFRESH_TOKEN_INVALID`, 403, 429 |

## Security considerations

- Separate secrets + `type` claim: an access token can never refresh, and a refresh token can never authenticate.
- `alg: none`, tampered tokens, wrong `iss`/`aud` and non-UUID `sid` are all rejected with 401, never 500.
- Rotating the refresh secret logs everyone out. Graceful key rotation (`kid`) is future work.

## Acceptance criteria

- [ ] Claims are exactly as listed. The header is `HS256`/`JWT`. TTLs come from config.
- [ ] Expired → `AUTH_TOKEN_EXPIRED`. Missing → `AUTH_TOKEN_MISSING`. Forged/cross-secret/`alg:none`/wrong type → `AUTH_TOKEN_INVALID`.
- [ ] Refresh returns a new pair. The old refresh token cannot be used again.
- [ ] Tokens issued after a role change carry the new roles.

## Required tests

| Test | File |
|---|---|
| Claims, secrets, TTL, jti uniqueness, hashing | `src/modules/auth/services/token.service.spec.ts` |
| Failure mapping | `src/modules/auth/guards/token-guards.spec.ts` |
| Access-token matrix | `test/auth-jwt.e2e-spec.ts` |
| Refresh matrix (rotation chain, reuse, concurrency, expiry, wrong type, forged jti) | `test/auth-refresh.e2e-spec.ts` |
| Refresh use case | `src/modules/auth/auth.service.spec.ts` (`refreshTokens`) |
