# JWT Specification

| Field | Value |
|---|---|
| Document | JWT_SPEC |
| Status | Draft for implementation |
| Libraries | `@nestjs/jwt` (signing), `@nestjs/passport` + `passport-jwt` (verification) |
| Related | [AUTH_ARCHITECTURE](./AUTH_ARCHITECTURE.md) · [AUTH_DATABASE](./AUTH_DATABASE.md) · [AUTH_SECURITY](./AUTH_SECURITY.md) · [AUTH_API](./AUTH_API.md) |

## 1. Two tokens, two jobs

| | Access token | Refresh token |
|---|---|---|
| Purpose | Authenticate **every** protected API request | Get a new token pair, **only** at `POST /auth/refresh` |
| Transport | `Authorization: Bearer <token>` header | JSON body field `refreshToken` |
| Default lifetime | `15m` (`JWT_ACCESS_EXPIRES_IN`) | `7d` (`JWT_REFRESH_EXPIRES_IN`; `30d` allowed) |
| Signing secret | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` (MUST differ) |
| Server state | Checked against its session (`sid`) on every request | The session stores the SHA-256 hash of the current refresh token |
| Rotation | New one on every login and refresh | **Single use**: replaced on every refresh |
| Revocation | Immediate, via session revocation | Immediate, via session revocation or rotation |
| Contains identity data | `sub`, `email`, `roles` | `sub` only |
| Accepted by | `JwtStrategy` (`'jwt'`) | `JwtRefreshStrategy` (`'jwt-refresh'`) |

The access token is **never** accepted at `/auth/refresh`. The refresh token is **never** accepted by `JwtAuthGuard`. Different secrets and the `type` claim enforce this twice.

## 2. Header (both tokens)

```json
{ "alg": "HS256", "typ": "JWT" }
```

- Algorithm: **HS256** (HMAC-SHA256). The verifier MUST pin `algorithms: ['HS256']`, which rules out `alg: none` and algorithm confusion.
- A `kid` header is not used in this scope (see §9 on secret rotation).
- Why HS256: one backend both issues and verifies. RS256/EdDSA is the upgrade path once other services must verify tokens without holding the signing key. That change is confined to `jwt.config.ts`, `TokenService` and the two strategies.

## 3. Access token

### 3.1 Claims

```json
{
  "sub": "8f1c2e5a-0b7d-4c1e-9a55-2d3f1b6c7e90",
  "email": "user@example.com",
  "roles": ["USER"],
  "sid": "3b0e7a52-6f2d-4a8c-b1e4-9c7d5f0a1e23",
  "type": "access",
  "iss": "nestjs-boilerplate",
  "aud": "nestjs-boilerplate-api",
  "iat": 1780000000,
  "exp": 1780000900
}
```

| Claim | Type | Required | Source | Notes |
|---|---|---|---|---|
| `sub` | uuid string | yes | `users.id` | Subject |
| `email` | string | yes | `users.email` | Normalized. Informational for clients. The server trusts the DB copy. |
| `roles` | `Role[]` | yes | `user_roles` at issue time | **UI hint only.** Authorization uses DB roles loaded by `JwtStrategy` (FR-ROLE-05). |
| `sid` | uuid string | yes | `auth_sessions.id` | Binds the token to a session. This is what makes logout immediate. |
| `type` | `"access"` | yes | constant | Token-type discriminator |
| `iss` | string | yes | `JWT_ISSUER` | |
| `aud` | string | yes | `JWT_AUDIENCE` | |
| `iat` | number | yes | set by library | |
| `exp` | number | yes | `iat + JWT_ACCESS_EXPIRES_IN` | |

`sid`, `type`, `iss`, `aud` are added to the requested minimal payload (`sub`, `email`, `roles`, `iat`, `exp`) because session binding, token-type separation and issuer/audience checks are security requirements. None of them is sensitive.

### 3.2 TypeScript contract

```ts
// modules/auth/interfaces/jwt-payload.interface.ts
export interface AccessTokenPayload {
  sub: string; email: string; roles: Role[]; sid: string; type: 'access';
  iss?: string; aud?: string | string[]; iat?: number; exp?: number;
}
export interface RefreshTokenPayload {
  sub: string; sid: string; jti: string; type: 'refresh';
  iss?: string; aud?: string | string[]; iat?: number; exp?: number;
}
```

### 3.3 Issuing

```ts
this.jwtService.signAsync(
  { sub: user.id, email: user.email, roles: user.roles, sid: sessionId, type: 'access' },
  { secret: jwt.access.secret, expiresIn: jwt.access.expiresIn,
    issuer: jwt.issuer, audience: jwt.audience, algorithm: 'HS256' },
);
```

`JwtModule.register({})` is registered with **no** default secret. Every sign call passes its secret explicitly, so a token can never be signed with the wrong key by default.

### 3.4 Validation (`JwtStrategy`)

In order. The first failure stops processing:

1. Extract with `ExtractJwt.fromAuthHeaderAsBearerToken()`. None found → `401 AUTH_TOKEN_MISSING`.
2. `passport-jwt` verifies: `secretOrKey = JWT_ACCESS_SECRET`, `algorithms: ['HS256']`, `issuer`, `audience`, `ignoreExpiration: false`, `jsonWebTokenOptions: { clockTolerance: 5 }`. Expired → `401 AUTH_TOKEN_EXPIRED`. Any other failure (bad signature, malformed, wrong iss/aud) → `401 AUTH_TOKEN_INVALID`.
3. `payload.type !== 'access'` → `401 AUTH_TOKEN_INVALID`.
4. `SessionsService.findActiveSessionForAccess(payload.sid, payload.sub)`. Returns nothing (revoked, expired, deleted, user mismatch) → `401 AUTH_TOKEN_INVALID`.
5. `user.status !== ACTIVE` → `403 AUTH_ACCOUNT_NOT_ACTIVE`.
6. Return `AuthenticatedUser { id, email, roles (DB), status, sessionId }`.

### 3.5 Expiration strategy

- Fixed lifetime from issue. No sliding, no renewal of the same token.
- The client refreshes when it gets `401 AUTH_TOKEN_EXPIRED`, or pre-emptively shortly before `exp`.
- `expiresIn` in API responses = access-token lifetime in **seconds**, computed with `parseDurationToSeconds(JWT_ACCESS_EXPIRES_IN)`.

## 4. Refresh token

### 4.1 Claims

```json
{
  "sub": "8f1c2e5a-0b7d-4c1e-9a55-2d3f1b6c7e90",
  "sid": "3b0e7a52-6f2d-4a8c-b1e4-9c7d5f0a1e23",
  "jti": "c9a4f1d0-7e2b-4b38-8d61-5a0f3e9b2c74",
  "type": "refresh",
  "iss": "nestjs-boilerplate",
  "aud": "nestjs-boilerplate-api",
  "iat": 1780000000,
  "exp": 1780604800
}
```

| Claim | Notes |
|---|---|
| `sub` | User id |
| `sid` | Session id. Stable for the whole life of the session. |
| `jti` | A fresh `crypto.randomUUID()` **per token**. Two tokens issued in the same second for the same session always differ, so their hashes differ. |
| `type` | `"refresh"` |
| `iss`, `aud`, `iat`, `exp` | As for access. `exp = iat + JWT_REFRESH_EXPIRES_IN`. |

The refresh token carries **no** `email` and **no** `roles`. It is not an identity document.

### 4.2 Issuing

Same call shape as §3.3, but with `jwt.refresh.secret` / `jwt.refresh.expiresIn`, and `jwtid` set to a new uuid (or `jti` in the payload). `TokenService.signRefreshToken` returns `{ token, expiresAt }`, where `expiresAt = new Date(exp * 1000)`, decoded from the signed token so DB and token always agree.

### 4.3 Storage

- Server: `auth_sessions.refresh_token_hash = sha256(token).hex`. The raw token is never persisted or logged.
- SHA-256 (not Argon2/bcrypt) is correct here. The token is a high-entropy, server-generated secret, so slow hashing adds nothing. **bcrypt is forbidden** for this: it truncates input at 72 bytes, and JWTs share a long common prefix, so different tokens would produce the same hash (AUTH_SECURITY SEC-TOKEN-04).
- Comparison: `crypto.timingSafeEqual(Buffer.from(a,'hex'), Buffer.from(b,'hex'))` after a length check.

### 4.4 Validation (`JwtRefreshStrategy` → `SessionsService.validateForRefresh`)

1. Extract with `ExtractJwt.fromBodyField('refreshToken')`. None → `401 AUTH_REFRESH_TOKEN_INVALID`.
2. `passport-jwt` verifies with `JWT_REFRESH_SECRET`, `algorithms: ['HS256']`, `issuer`, `audience`, expiry. Any failure → `401 AUTH_REFRESH_TOKEN_INVALID` (expired is **not** distinguished: the client's action is the same, log in again).
3. `payload.type !== 'refresh'` → `401 AUTH_REFRESH_TOKEN_INVALID`.
4. Load the session by `payload.sid`:
   - not found, `user_id ≠ payload.sub`, `revoked_at` set, or `expires_at ≤ now()` → `401 AUTH_REFRESH_TOKEN_INVALID`.
5. `sha256(rawToken) ≠ session.refresh_token_hash` → **reuse detected** (§6.3) → revoke the session with `REUSE_DETECTED` → `401 AUTH_REFRESH_TOKEN_INVALID`.
6. Load the user. Status ≠ `ACTIVE` → revoke the session with `USER_NOT_ACTIVE` → `403 AUTH_ACCOUNT_NOT_ACTIVE`.
7. Return `RefreshContext { userId, sessionId, refreshToken }`.

### 4.5 Expiration strategy

- **Sliding per rotation**: each successful refresh issues a new refresh token with a full `JWT_REFRESH_EXPIRES_IN` lifetime and moves `auth_sessions.expires_at` forward.
- A session left unused for longer than the refresh lifetime expires and needs a new login.
- An absolute maximum session age (for example 90 days regardless of activity) is OPTIONAL (OPT-13).

## 5. Verification options reference

### 5.1 `JwtStrategy`

```ts
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: jwt.access.secret,
  algorithms: ['HS256'],
  issuer: jwt.issuer,
  audience: jwt.audience,
  ignoreExpiration: false,
  jsonWebTokenOptions: { clockTolerance: 5 },
});
```

### 5.2 `JwtRefreshStrategy`

```ts
super({
  jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
  secretOrKey: jwt.refresh.secret,
  algorithms: ['HS256'],
  issuer: jwt.issuer,
  audience: jwt.audience,
  ignoreExpiration: false,
  passReqToCallback: true,
  jsonWebTokenOptions: { clockTolerance: 5 },
});
// validate(req, payload): raw token = req.body.refreshToken
```

## 6. Refresh-token rotation

### 6.1 Normal rotation

```
login ─▶ RT1 (hash H1 stored in session S)
RT1 ─▶ POST /auth/refresh ─▶ verify RT1, H1 matches ─▶ issue AT2 + RT2
                           ─▶ UPDATE S SET hash=H2 WHERE hash=H1   (compare-and-swap)
RT1 is now dead: its hash no longer matches anything.
RT2 ─▶ POST /auth/refresh ─▶ … ─▶ RT3
```

Steps inside `AuthService.refreshTokens(ctx)`:

1. Load the user (for `email`, `roles`) via `UsersService.findById`.
2. `accessToken = signAccessToken(user, ctx.sessionId)`.
3. `{ token: newRefresh, expiresAt } = signRefreshToken(user.id, ctx.sessionId)`.
4. `ok = sessions.rotate(ctx.sessionId, sha256(ctx.refreshToken), sha256(newRefresh), expiresAt)`.
5. `!ok` → `sessions.revoke(sid, REUSE_DETECTED)`, log a security warning, throw `AUTH_REFRESH_TOKEN_INVALID`.
6. Return `{ accessToken, refreshToken: newRefresh, tokenType: 'Bearer', expiresIn }`.

Tokens are signed **before** the DB update. If the update affects no row, the new tokens are thrown away and never returned. The new refresh token's hash was never stored, so it can never be redeemed. The new access token was never sent to the client, and the session it points to is revoked in step 5 anyway.

### 6.2 Why compare-and-swap

Two concurrent refreshes with the same RT1 both pass step 4.4. Only one `UPDATE … WHERE refresh_token_hash = H1` can affect a row. The loser sees 0 rows and treats it as reuse, which revokes the session. This is the **strict** policy: a buggy client that fires parallel refreshes gets logged out. Clients MUST serialize refresh calls (single-flight). A grace window for concurrent refreshes is not implemented (see the plan's pending decisions).

### 6.3 Reuse detection

A refresh token with a **valid signature** whose hash is **not** the session's current hash can only be an older token from that same session. Either an attacker or the legitimate client is replaying an already-used token, and the server cannot tell which. So:

1. Revoke the whole session (`revoked_reason = REUSE_DETECTED`). Both the attacker's and the victim's chains die.
2. Log `warn` event `auth.refresh.reuse_detected` with `userId`, `sessionId`, `ip`. No token material.
3. Respond `401 AUTH_REFRESH_TOKEN_INVALID`. The legitimate user must log in again.
4. Other sessions of the same user are **not** revoked by default (per-device containment). Revoking all sessions on reuse is a one-line change (`revokeAllForUser`) and is listed as a pending decision.

## 7. Revoked-token handling summary

| Situation | Access token behaviour | Refresh token behaviour |
|---|---|---|
| Session revoked (any reason) | Next request → `401 AUTH_TOKEN_INVALID` | `401 AUTH_REFRESH_TOKEN_INVALID` |
| Session expired | `401 AUTH_TOKEN_INVALID` (if the access token itself is still unexpired) | `401 AUTH_REFRESH_TOKEN_INVALID` |
| Old (rotated) refresh token presented | — | Session revoked (`REUSE_DETECTED`) + `401` |
| User set to non-`ACTIVE` | `403 AUTH_ACCOUNT_NOT_ACTIVE` | Session revoked (`USER_NOT_ACTIVE`) + `403` |
| User deleted | Sessions cascade-deleted → `401 AUTH_TOKEN_INVALID` | `401 AUTH_REFRESH_TOKEN_INVALID` |
| Role changed | Takes effect on the next request (DB roles). The `roles` claim is stale until the next refresh. | New tokens carry the new roles |
| Secret changed | Every token → `401 AUTH_TOKEN_INVALID` | Every token → `401` → users log in again |

## 8. Transport alternatives (future)

Refresh tokens travel in the JSON body because mobile, server-to-server and SPA clients can all handle that. For **browser** clients, an `HttpOnly; Secure; SameSite=Strict; Path=/auth` cookie is the stronger option against XSS. To adopt it (OPT-10):

- `JwtRefreshStrategy`: extractor becomes `ExtractJwt.fromExtractors([cookieExtractor, fromBodyField])`.
- `AuthController`: login and refresh set the cookie through `@Res({ passthrough: true })` and omit `refreshToken` from the body. Logout clears it.
- Add CSRF protection for the cookie-authenticated routes and set CORS `credentials: true` with an explicit origin allowlist.
- The service layer does not change.

## 9. Secret management and rotation

- Secrets are at least 32 random bytes, base64/hex encoded (for example `openssl rand -base64 48`), supplied only via environment or secret manager.
- Access and refresh secrets MUST differ (validated at boot).
- Emergency rotation: changing a secret invalidates every token of that type immediately. Changing `JWT_REFRESH_SECRET` forces everyone to log in again.
- Graceful rotation (a list of verification keys with `kid`) is OPTIONAL future work, confined to `jwt.config.ts`, `TokenService` and the strategies' `secretOrKeyProvider`.

## 10. Client guidance (documented in AUTH_API)

- Keep the access token in memory. Keep the refresh token in the platform's secure storage (iOS Keychain, Android Keystore). For web, prefer the cookie mode in §8 once it is implemented.
- On `401 AUTH_TOKEN_EXPIRED`: call `/auth/refresh` **once** (single-flight across tabs and requests), replace **both** tokens, retry the original request.
- On `401 AUTH_REFRESH_TOKEN_INVALID`: clear tokens and send the user to login.
- Never send the refresh token to any endpoint other than `/auth/refresh`.
