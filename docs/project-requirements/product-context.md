# Product Context

## What it is

This repository is a **reusable NestJS backend boilerplate**. Its purpose is to provide production-ready **local authentication** that can serve as the foundation for future applications. Teams start new products from it instead of rebuilding login, sessions and permissions each time.

The backend is **independent of any frontend framework**. React/Next.js web apps, mobile apps and server-to-server clients all consume the same REST API.

## Core capabilities

| Capability | Summary | Owning epic |
|---|---|---|
| Email/password registration | Public sign-up. Every new account is a plain `USER`. | 01 |
| Local login | Credential verification with generic errors | 01 |
| JWT authentication | Short-lived access tokens on every request | 03 |
| Refresh-token rotation | Single-use refresh tokens with theft (reuse) detection | 03, 04 |
| Multi-device sessions | One session per device. Revoke one, all, or all others. | 04 |
| USER / ADMIN authorization | Role checks enforced server-side from the database | 02 |
| User administration | Admins list, inspect, suspend/activate, promote/demote users and revoke their sessions | 05 |
| Security controls | Argon2id, rate limiting, secure headers, CORS, strict validation, safe logging | 06 |
| PostgreSQL persistence | Migrations-only schema with named constraints | 08 |

## Users of the product

| Actor | Can |
|---|---|
| Anonymous visitor | register, log in, refresh tokens |
| `USER` | own profile (`/auth/me`), own sessions/devices, logout, standard authenticated routes |
| `ADMIN` | everything a USER can, plus all `/users/**` administration |
| Operator / DevOps | configure, migrate, seed the first admin, purge old sessions |

## Guiding principles

- **Secure by default.** Security rules win over convenience (see epic 06).
- **The backend is the source of truth for permissions.** Frontends only display what the API allows.
- **Every responsibility is separated.** Each concern has one owner (epic) and one place in the code.
- **Extensible without rewrites.** Every login method ends in one seam (`AuthService.issueSession`), so OAuth, MFA or magic links can be added later without touching sessions or tokens.

## In scope (implemented)

Registration, login, logout, logout-all, token refresh with rotation, current user, device sessions, USER/ADMIN roles, admin user management, admin seed, session purge, security controls, complete unit + e2e test suite.

## Out of scope (current version)

- External identity providers: Google, Microsoft, GitHub, Firebase Auth, Auth0, Clerk, Supabase Auth, etc.
- Email delivery: verification emails, forgot/reset password.
- MFA, API keys, service accounts, multi-tenancy, audit-log persistence.
- Any frontend or HTML pages. The API has no `/` page, and `GET /health` is the liveness check.

## Planned extension points (not implemented)

| Future feature | Prepared by |
|---|---|
| Email verification | `UserStatus.PENDING_VERIFICATION`; register sets status in one place |
| Forgot/reset password | `PasswordService.hash`, `UsersService.updatePasswordHash`, `SessionsService.revokeAllForUser` |
| MFA | a step between `validateCredentials()` and `issueSession()` |
| OAuth / social login | `issueSession(user, ctx)`; future `auth_identities` table |
| API keys / permissions / tenants | new strategies/guards beside the existing ones; `RolesService` is the single authorization resolver |
| Cookie transport for refresh tokens | extraction isolated in `jwt-refresh.strategy.ts` |
| OpenAPI (Swagger) | deferred; `docs/specs/AUTH_API.md` is the contract today |

## Success criteria for the boilerplate

- A new project can clone it, configure `.env`, run migrations and have working auth in minutes.
- All acceptance criteria in the epics pass (`npm run test:cov` green).
- No MUST rule in epic 06 is violated.
