# Authentication REST API Contract

| Field | Value |
|---|---|
| Document | AUTH_API |
| Status | Draft for implementation |
| Base path | `/{API_PREFIX}` (empty by default). All paths below are relative to it. |
| Content type | `application/json; charset=utf-8` for requests and responses |
| Related | [AUTH_REQUIREMENTS](./AUTH_REQUIREMENTS.md) · [JWT_SPEC](./JWT_SPEC.md) · [AUTH_SECURITY](./AUTH_SECURITY.md) |

## 1. Endpoint summary

| Method | Path | Auth | Level | Success |
|---|---|---|---|---|
| POST | `/auth/register` | none | MUST | `201` |
| POST | `/auth/login` | none | MUST | `200` |
| POST | `/auth/refresh` | refresh token (body) | MUST | `200` |
| POST | `/auth/logout` | access token | MUST | `200` |
| POST | `/auth/logout-all` | access token | MUST | `200` |
| GET | `/auth/me` | access token | MUST | `200` |
| GET | `/auth/sessions` | access token | SHOULD | `200` |
| DELETE | `/auth/sessions/:id` | access token | SHOULD | `200` |
| POST | `/auth/sessions/revoke-others` | access token | SHOULD | `200` |
| GET | `/users` | access token + `ADMIN` | MUST | `200` |
| GET | `/users/stats` | access token + `ADMIN` | MUST | `200` |
| GET | `/users/:id` | access token + `ADMIN` | MUST | `200` |
| PATCH | `/users/:id/status` | access token + `ADMIN` | MUST | `200` |
| PATCH | `/users/:id/roles` | access token + `ADMIN` | MUST | `200` |
| GET | `/users/:id/sessions` | access token + `ADMIN` | MUST | `200` |
| DELETE | `/users/:id/sessions` | access token + `ADMIN` | MUST | `200` |

## 2. Conventions

### 2.1 Success envelope

Every successful response (all 2xx) has this shape:

```json
{ "success": true, "data": { } }
```

Controllers return the `data` value. `ResponseEnvelopeInterceptor` wraps it. `data` is never omitted. It is `null` only where stated.

Paginated `data`:

```json
{ "items": [], "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
```

### 2.2 Error envelope

Every error response (4xx/5xx) has this shape, produced by `AllExceptionsFilter`:

```json
{
  "success": false,
  "error": {
    "statusCode": 401,
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "details": null,
    "timestamp": "2026-09-24T12:00:00.000Z",
    "path": "/auth/login"
  }
}
```

- `code` is stable and machine-readable. Clients switch on `code`, never on `message`.
- `details` is `null`, except for `VALIDATION_FAILED`, where it is an array:

```json
"details": [
  { "field": "email", "messages": ["email must be a valid email address"] },
  { "field": "password", "messages": ["password must contain at least one letter and one digit"] }
]
```

Nested fields use dot paths (`address.city`). Submitted values are never echoed.

### 2.3 Common headers

| Header | Direction | Notes |
|---|---|---|
| `Authorization: Bearer <accessToken>` | request | On endpoints marked "access token" |
| `Content-Type: application/json` | request | Required for bodies |
| `Cache-Control: no-store` | response | On all `/auth/*` responses |
| `Retry-After` | response | On `429` |

### 2.4 Error code catalogue

| HTTP | `code` | Message (exact) | Raised when |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | `Request validation failed` | DTO validation fails. Unknown fields present. |
| 400 | `BAD_REQUEST` | `Bad request` | Malformed JSON, other generic 400 |
| 401 | `AUTH_INVALID_CREDENTIALS` | `Invalid email or password` | Login: unknown email **or** wrong password |
| 401 | `AUTH_TOKEN_MISSING` | `Authentication required` | No bearer token on a protected route |
| 401 | `AUTH_TOKEN_INVALID` | `Invalid or revoked access token` | Bad signature/format/iss/aud/type, session revoked or expired, user deleted |
| 401 | `AUTH_TOKEN_EXPIRED` | `Access token expired` | Access token `exp` passed |
| 401 | `AUTH_REFRESH_TOKEN_INVALID` | `Invalid refresh token` | Any refresh failure (missing, expired, revoked, reused, wrong type) |
| 403 | `AUTH_ACCOUNT_NOT_ACTIVE` | `Account is not active` | Status ≠ `ACTIVE` (after password check on login) |
| 403 | `AUTH_FORBIDDEN` | `Insufficient permissions` | Authenticated but lacks the required role |
| 404 | `RESOURCE_NOT_FOUND` | `Resource not found` | Unknown route, or session not owned by the caller |
| 403 | `USER_SELF_MODIFICATION_FORBIDDEN` | `You cannot change your own status or remove your own admin role` | Admin targets themself (FR-ADMIN-06) |
| 409 | `AUTH_EMAIL_ALREADY_EXISTS` | `Email is already registered` | Duplicate normalized email |
| 413 | `PAYLOAD_TOO_LARGE` | `Payload too large` | Body > 100 kb |
| 429 | `RATE_LIMITED` | `Too many requests, please try again later` | Throttler limit hit |
| 500 | `INTERNAL_ERROR` | `Internal server error` | Anything unexpected |

For `AUTH_ACCOUNT_NOT_ACTIVE`, `details` MAY be `{ "status": "SUSPENDED" }` **on login only**. The caller has proven the password at that point, and the client can then tell `PENDING_VERIFICATION` apart from `SUSPENDED`.

### 2.5 Shared schemas

**UserResponse** (the only user representation the API ever returns):

```json
{
  "id": "8f1c2e5a-0b7d-4c1e-9a55-2d3f1b6c7e90",
  "email": "user@example.com",
  "roles": ["USER"],
  "status": "ACTIVE",
  "lastLoginAt": "2026-09-24T12:00:00.000Z",
  "createdAt": "2026-09-01T08:30:00.000Z",
  "updatedAt": "2026-09-24T12:00:00.000Z"
}
```

`lastLoginAt` may be `null`. Fields **never** present: `password`, `passwordHash`, `password_hash`, `refreshTokenHash`, session internals.

**Tokens** (fields merged into login and refresh `data`):

| Field | Type | Notes |
|---|---|---|
| `accessToken` | string (JWT) | |
| `refreshToken` | string (JWT) | Replace the stored one every time |
| `tokenType` | `"Bearer"` | |
| `expiresIn` | integer | Access-token lifetime in seconds (e.g. `900`) |

---

## 3. Endpoints

### 3.1 `POST /auth/register`

**Purpose:** create a local account. No tokens are issued and no session is created.
**Authentication:** none. **Throttle:** 5 / 60 s per IP.

**Request body (`RegisterDto`):**

```json
{ "email": "User@Example.com ", "password": "S3cure-passphrase" }
```

| Field | Rules (in order) | Messages |
|---|---|---|
| `email` | required · string · transform `trim().toLowerCase()` · `@IsEmail()` · `@MaxLength(254)` | `email is required` · `email must be a valid email address` · `email must be at most 254 characters` |
| `password` | required · string · `@MinLength(8)` · `@MaxLength(128)` · `@Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)` · not equal to email (custom `@NotEqualToEmail()` class validator, case-insensitive) | `password is required` · `password must be at least 8 characters` · `password must be at most 128 characters` · `password must contain at least one letter and one digit` · `password must not be the same as the email` |
| *other* | forbidden | `property <name> should not exist` |

**Success, `201 Created`:**

```json
{
  "success": true,
  "data": {
    "user": { "id": "8f1c…", "email": "user@example.com", "roles": ["USER"], "status": "ACTIVE",
              "lastLoginAt": null, "createdAt": "…", "updatedAt": "…" }
  }
}
```

**Errors:** `400 VALIDATION_FAILED` · `409 AUTH_EMAIL_ALREADY_EXISTS` · `429 RATE_LIMITED` · `500 INTERNAL_ERROR`

---

### 3.2 `POST /auth/login`

**Purpose:** check credentials, create a new session and return a token pair.
**Authentication:** none. **Throttle:** 5 / 60 s per IP (+ SHOULD 10 / 15 min per IP+email).

**Request body (`LoginDto`):**

```json
{ "email": "user@example.com", "password": "S3cure-passphrase" }
```

| Field | Rules | Messages |
|---|---|---|
| `email` | required · string · transform `trim().toLowerCase()` · `@IsEmail()` · `@MaxLength(254)` | as register |
| `password` | required · string · `@IsNotEmpty()` · `@MaxLength(128)`. **No** policy check. | `password is required` · `password must be at most 128 characters` |

**Success, `200 OK`:**

```json
{
  "success": true,
  "data": {
    "user": { "id": "8f1c…", "email": "user@example.com", "roles": ["USER"], "status": "ACTIVE",
              "lastLoginAt": "…", "createdAt": "…", "updatedAt": "…" },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "tokenType": "Bearer",
    "expiresIn": 900
  }
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Malformed input |
| 401 | `AUTH_INVALID_CREDENTIALS` | Unknown email or wrong password (identical bodies) |
| 403 | `AUTH_ACCOUNT_NOT_ACTIVE` | Correct password, status ≠ `ACTIVE` |
| 429 | `RATE_LIMITED` | Throttled |

---

### 3.3 `POST /auth/refresh`

**Purpose:** swap a valid refresh token for a new access + refresh pair (rotation). The presented token becomes unusable.
**Authentication:** refresh token in the body (`JwtRefreshGuard`). **Throttle:** 30 / 60 s per IP.

**Request body (`RefreshTokenDto`):**

```json
{ "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…" }
```

| Field | Rules |
|---|---|
| `refreshToken` | required · string · `@IsJWT()` · `@MaxLength(2048)` |

Because guards run before pipes, a missing, malformed or invalid `refreshToken` is rejected by the guard with **`401 AUTH_REFRESH_TOKEN_INVALID`**, not `400`. The DTO still applies `whitelist` / `forbidNonWhitelisted` (extra fields → `400`) and documents the schema.

**Success, `200 OK`:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ…",
    "refreshToken": "eyJ…",
    "tokenType": "Bearer",
    "expiresIn": 900
  }
}
```

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Extra body fields |
| 401 | `AUTH_REFRESH_TOKEN_INVALID` | Missing, malformed, expired, wrong type, session revoked/expired/unknown, **reused** (the session is also revoked) |
| 403 | `AUTH_ACCOUNT_NOT_ACTIVE` | User no longer `ACTIVE` (the session is revoked) |
| 429 | `RATE_LIMITED` | Throttled |

---

### 3.4 `POST /auth/logout`

**Purpose:** revoke the **current** session (the `sid` of the access token used). Its refresh token and access tokens stop working immediately.
**Authentication:** access token (`JwtAuthGuard`). **Body:** none. Any body sent is ignored (the handler binds no DTO).

**Success, `200 OK`:**

```json
{ "success": true, "data": { "revokedSessions": 1 } }
```

**Errors:** `401 AUTH_TOKEN_MISSING | AUTH_TOKEN_INVALID | AUTH_TOKEN_EXPIRED` · `403 AUTH_ACCOUNT_NOT_ACTIVE`

Idempotency: once the session is revoked, its access token fails with `401 AUTH_TOKEN_INVALID`. Clients MUST treat any `401` from logout as "already logged out" and clear local tokens.

---

### 3.5 `POST /auth/logout-all`

**Purpose:** revoke **every** active session of the current user, including the current one.
**Authentication:** access token. **Body:** none.

**Success, `200 OK`:**

```json
{ "success": true, "data": { "revokedSessions": 3 } }
```

**Errors:** as `/auth/logout`.

---

### 3.6 `GET /auth/me`

**Purpose:** return the authenticated user's profile, read fresh from the database.
**Authentication:** access token.

**Success, `200 OK`:**

```json
{
  "success": true,
  "data": {
    "user": { "id": "8f1c…", "email": "user@example.com", "roles": ["USER"], "status": "ACTIVE",
              "lastLoginAt": "…", "createdAt": "…", "updatedAt": "…" }
  }
}
```

**Errors:** `401 AUTH_TOKEN_MISSING | AUTH_TOKEN_INVALID | AUTH_TOKEN_EXPIRED` · `403 AUTH_ACCOUNT_NOT_ACTIVE`

---

### 3.7 `GET /auth/sessions` (SHOULD)

**Purpose:** list the caller's usable sessions (not revoked, not expired), newest first.
**Authentication:** access token.

```json
{
  "success": true,
  "data": {
    "items": [
      { "id": "3b0e…", "current": true, "ipAddress": "203.0.113.7",
        "userAgent": "Mozilla/5.0 …", "createdAt": "…", "lastUsedAt": "…", "expiresAt": "…" }
    ]
  }
}
```

No pagination: the list is bounded by active devices. **Errors:** as `/auth/me`.

### 3.8 `DELETE /auth/sessions/:id` (SHOULD)

**Purpose:** revoke one of the caller's own sessions. `:id` is validated with `ParseUUIDPipe` (bad format → `400`).

Success: `200 { "success": true, "data": { "revokedSessions": 1 } }`
Errors: `400 VALIDATION_FAILED` · `401 …` · `404 RESOURCE_NOT_FOUND` (not found, not owned, or already revoked)

Revoking the current session this way behaves like `/auth/logout`.

### 3.9 `POST /auth/sessions/revoke-others` (SHOULD)

**Purpose:** revoke all of the caller's sessions **except** the current one.
Success: `200 { "success": true, "data": { "revokedSessions": 2 } }` · Errors: as `/auth/me`.

### 3.10 `GET /users` (ADMIN)

**Purpose:** paginated user list for administrators.
**Authentication:** access token + role `ADMIN`.

**Query (`ListUsersQueryDto`):** `page` int ≥ 1 (default 1) · `limit` int 1–100 (default 20) · `status` optional `UserStatus` · `role` optional `Role` · `search` optional string ≤ 254 (case-insensitive email substring; `%`/`_` are escaped). Numbers transformed with `@Type(() => Number)`.

**Success, `200 OK`:** `data = { items: UserResponse[], meta: { page, limit, total, totalPages } }`, ordered by `createdAt DESC`.

**Errors:** `400 VALIDATION_FAILED` · `401 …` · `403 AUTH_FORBIDDEN` · `403 AUTH_ACCOUNT_NOT_ACTIVE`

All `/users/**` endpoints below share the same auth (access token + `ADMIN`) and the same `401`/`403` errors. `:id` uses `ParseUUIDPipe` (bad format → `400`).

### 3.11 `GET /users/stats` (ADMIN)

```json
{ "success": true, "data": {
  "total": 42,
  "byStatus": { "ACTIVE": 38, "INACTIVE": 2, "SUSPENDED": 1, "PENDING_VERIFICATION": 1 },
  "byRole": { "USER": 42, "ADMIN": 3 } } }
```

### 3.12 `GET /users/:id` (ADMIN)

`200 { success, data: { user: UserResponse } }` · `404 RESOURCE_NOT_FOUND`.

### 3.13 `PATCH /users/:id/status` (ADMIN)

Body (`UpdateUserStatusDto`): `{ "status": "SUSPENDED" }`. `status` is required and must be a `UserStatus` value.
`200 { success, data: { user } }` · `400 VALIDATION_FAILED` · `403 USER_SELF_MODIFICATION_FORBIDDEN` (own id) · `404 RESOURCE_NOT_FOUND`.
The user's existing access and refresh tokens stop working on their next use if the new status is not `ACTIVE`.

### 3.14 `PATCH /users/:id/roles` (ADMIN)

Body (`UpdateUserRolesDto`): `{ "roles": ["ADMIN"] }`. `roles` is a required array of 1–10 unique `Role` values. The stored set always includes `USER`, so `["ADMIN"]` is stored as `[USER, ADMIN]` and `["USER"]` demotes to a plain user.
`200 { success, data: { user } }` · `400 VALIDATION_FAILED` · `403 USER_SELF_MODIFICATION_FORBIDDEN` (removing own `ADMIN`) · `404 RESOURCE_NOT_FOUND`.
The new roles apply on the target's next request (DB roles, FR-ROLE-05).

### 3.15 `GET /users/:id/sessions` (ADMIN)

`200 { success, data: { items: AdminSessionResponse[] } }`, with the same fields as §3.7 minus `current` · `404 RESOURCE_NOT_FOUND` for an unknown user.

### 3.16 `DELETE /users/:id/sessions` (ADMIN)

Revokes every active session of the user (`ADMIN_REVOKED`). `200 { success, data: { revokedSessions: n } }` · `404 RESOURCE_NOT_FOUND`.

---

## 4. Status code matrix

| Endpoint | 200 | 201 | 400 | 401 | 403 | 404 | 409 | 429 |
|---|---|---|---|---|---|---|---|---|
| POST /auth/register | | ✓ | ✓ | | | | ✓ | ✓ |
| POST /auth/login | ✓ | | ✓ | ✓ | ✓ | | | ✓ |
| POST /auth/refresh | ✓ | | ✓ | ✓ | ✓ | | | ✓ |
| POST /auth/logout | ✓ | | | ✓ | ✓ | | | ✓ |
| POST /auth/logout-all | ✓ | | | ✓ | ✓ | | | ✓ |
| GET /auth/me | ✓ | | | ✓ | ✓ | | | ✓ |
| GET /auth/sessions | ✓ | | | ✓ | ✓ | | | ✓ |
| DELETE /auth/sessions/:id | ✓ | | ✓ | ✓ | ✓ | ✓ | | ✓ |
| POST /auth/sessions/revoke-others | ✓ | | | ✓ | ✓ | | | ✓ |
| GET /users, /users/stats | ✓ | | ✓ | ✓ | ✓ | | | ✓ |
| GET /users/:id, GET/DELETE /users/:id/sessions | ✓ | | ✓ | ✓ | ✓ | ✓ | | ✓ |
| PATCH /users/:id/status, /users/:id/roles | ✓ | | ✓ | ✓ | ✓ | ✓ | | ✓ |

Any endpoint may also return `500 INTERNAL_ERROR`.

## 5. Example client flow

```bash
# 1. Register
curl -sX POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"S3cure-passphrase"}'

# 2. Login → keep data.accessToken (memory) and data.refreshToken (secure storage)
curl -sX POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"S3cure-passphrase"}'

# 3. Call a protected endpoint
curl -s $API/auth/me -H "Authorization: Bearer $ACCESS"

# 4. On 401 AUTH_TOKEN_EXPIRED → refresh once, replace BOTH tokens, retry
curl -sX POST $API/auth/refresh -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}"

# 5. Logout this device
curl -sX POST $API/auth/logout -H "Authorization: Bearer $ACCESS"
```

## 6. OpenAPI (SHOULD)

If `@nestjs/swagger` is enabled, every DTO in this document gets `@ApiProperty` metadata, protected routes get `@ApiBearerAuth()`, and every error listed per endpoint is declared with `@ApiResponse` using the shared `ErrorResponseDto`. The docs are served at `/docs` when `NODE_ENV !== 'production'`.
