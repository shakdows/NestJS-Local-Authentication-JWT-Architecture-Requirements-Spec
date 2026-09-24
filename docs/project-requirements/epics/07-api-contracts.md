# Epic 07 — API Contracts

## Responsibility

This epic owns the **shape of every HTTP exchange**:

- the success and error envelopes
- the error-code catalogue and HTTP status conventions
- the validation-error format
- the endpoint index and status-code matrix
- shared schemas (`UserResponse`, token fields, pagination)

## Does Not Own

What each endpoint *does*: that belongs to its epic (01 auth, 03 refresh, 04 sessions, 05 admin). This epic only fixes *how it is expressed*.

## Objective

Clients (web, mobile, other services) can integrate once and handle every response predictably, switching on stable `code` values.

## Code

| Component | Path |
|---|---|
| Error codes + messages | `src/common/constants/error-codes.ts` |
| Domain exception | `src/common/exceptions/app.exception.ts` |
| Error envelope | `src/common/filters/all-exceptions.filter.ts` |
| Success envelope | `src/common/interceptors/response-envelope.interceptor.ts` |
| Validation format | `src/common/pipes/validation.pipe.ts`, `uuid-param.pipe.ts` |
| Error factories | `src/modules/auth/auth.errors.ts`, `src/modules/users/users.errors.ts` |

## Envelopes

**Success** (every 2xx):
```json
{ "success": true, "data": { } }
```

**Error** (every 4xx/5xx):
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

**Validation details** (`VALIDATION_FAILED` only):
```json
"details": [ { "field": "password", "messages": ["password must be at least 8 characters"] } ]
```

**Pagination** `data`: `{ "items": [], "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }`

## Error-code catalogue

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | DTO/param validation, unknown fields |
| 400 | `BAD_REQUEST` | malformed JSON, other 400s |
| 401 | `AUTH_INVALID_CREDENTIALS` | login: unknown email or wrong password |
| 401 | `AUTH_TOKEN_MISSING` | no bearer token |
| 401 | `AUTH_TOKEN_INVALID` | bad/forged token, revoked/expired session, deleted user |
| 401 | `AUTH_TOKEN_EXPIRED` | access token `exp` passed |
| 401 | `AUTH_REFRESH_TOKEN_INVALID` | any refresh failure |
| 403 | `AUTH_ACCOUNT_NOT_ACTIVE` | status ≠ ACTIVE (`details.status` on login only) |
| 403 | `AUTH_FORBIDDEN` | missing required role |
| 403 | `USER_SELF_MODIFICATION_FORBIDDEN` | admin targets own status / own ADMIN role |
| 404 | `RESOURCE_NOT_FOUND` | unknown route/resource, foreign session |
| 409 | `AUTH_EMAIL_ALREADY_EXISTS` | duplicate email |
| 413 | `PAYLOAD_TOO_LARGE` | body > 100 kb |
| 429 | `RATE_LIMITED` | throttled (+ `Retry-After`) |
| 500 | `INTERNAL_ERROR` | anything unexpected (no details leaked) |

## Endpoint index

| Method | Path | Auth | Success | Owner |
|---|---|---|---|---|
| GET | `/health` | — | 200 | 10 |
| POST | `/auth/register` | — | 201 | 01 |
| POST | `/auth/login` | — | 200 | 01 |
| POST | `/auth/refresh` | refresh token (body) | 200 | 03 |
| POST | `/auth/logout` | access | 200 | 01 |
| POST | `/auth/logout-all` | access | 200 | 01 |
| GET | `/auth/me` | access | 200 | 01 |
| GET | `/auth/sessions` | access | 200 | 04 |
| DELETE | `/auth/sessions/:id` | access | 200 | 04 |
| POST | `/auth/sessions/revoke-others` | access | 200 | 04 |
| GET | `/users` | ADMIN | 200 | 05 |
| GET | `/users/stats` | ADMIN | 200 | 05 |
| GET | `/users/:id` | ADMIN | 200 | 05 |
| PATCH | `/users/:id/status` | ADMIN | 200 | 05 |
| PATCH | `/users/:id/roles` | ADMIN | 200 | 05 |
| GET | `/users/:id/sessions` | ADMIN | 200 | 05 |
| DELETE | `/users/:id/sessions` | ADMIN | 200 | 05 |

There is no `GET /`: the API has no index page. An optional global prefix (`API_PREFIX`, e.g. `api/v1`) applies to all paths.

## Shared schemas

**UserResponse** (the only user shape ever returned):
```json
{ "id": "uuid", "email": "user@example.com", "roles": ["USER"], "status": "ACTIVE",
  "lastLoginAt": "ISO-8601 | null", "createdAt": "ISO-8601", "updatedAt": "ISO-8601" }
```

**Token fields** (login and refresh): `accessToken`, `refreshToken`, `tokenType: "Bearer"`, `expiresIn` (access lifetime in seconds).

## Business rules

- Clients switch on `code`, never on `message`.
- Responses never contain `password`, `passwordHash`, `refreshTokenHash` or session internals.
- Every response carries `Cache-Control: no-store`.

## Technical rules

- Controllers return plain data. The interceptor adds the envelope.
- Throw `AppException` via the error factories. Never construct ad-hoc error bodies.
- Guards run before pipes, so a missing refresh token returns `401` at `/auth/refresh`, not `400`.
- New error codes must be added to `ErrorCode`, `ERROR_MESSAGES`, this table and `docs/specs/AUTH_API.md` §2.4 together.

## Dependencies

Consumed by every epic that exposes HTTP.

## Security considerations

- 500 responses never include stack traces, SQL or messages from unknown errors.
- Validation details list field names and constraint messages, never values.

## Acceptance criteria

- [ ] Every 2xx is `{ success: true, data }`. Every error is the documented error envelope.
- [ ] Every error has a code from the catalogue.
- [ ] Status codes match the owning epic's API table.

## Required tests

| Test | File |
|---|---|
| Filter mapping and sanitizing | `src/common/filters/all-exceptions.filter.spec.ts` |
| Envelope | `src/common/interceptors/response-envelope.interceptor.spec.ts` |
| 404 envelope, malformed JSON, headers | `test/app.e2e-spec.ts` |
| Per-endpoint contracts | the e2e suites of epics 01, 03, 04, 05 |
