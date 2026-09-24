# START HERE — Instructions for AI Coding Agents

You are working on a **reusable NestJS 12 backend boilerplate** with a complete, local (no external provider) email/password + JWT authentication system, multi-device sessions, USER/ADMIN authorization and user administration. The system is **already implemented and tested**. Your job is usually to extend or change it without breaking it.

Read this file completely before you touch anything.

## 1. What this project is

- A backend-only REST API (no HTML pages). Frontends consume it over HTTP.
- Stack: NestJS 12 (ESM) · TypeScript 6 · PostgreSQL · TypeORM 1.x · Argon2id · JWT (HS256) · Vitest + Supertest. See [tech-specs.md](./tech-specs.md).
- Product purpose and scope: [product-context.md](./product-context.md).

## 2. Reading order

Read in this order. Stop at step 4 unless your task needs more.

| Step | Document | Why |
|---|---|---|
| 1 | [product-context.md](./product-context.md) | What the product is and is not |
| 2 | [tech-specs.md](./tech-specs.md) | The stack, defined once |
| 3 | [epics/06-security.md](./epics/06-security.md) | Rules that override everything else |
| 4 | The epic(s) that **own** your task (table below) | The responsibility you will change |
| 5 | [epics/07-api-contracts.md](./epics/07-api-contracts.md) | If you change any HTTP behaviour |
| 6 | [epics/09-testing.md](./epics/09-testing.md) | How to prove your change works |
| 7 | `docs/specs/*` sections referenced by the epic | Full technical detail |

## 3. One epic = one responsibility

| # | Epic | Owns |
|---|---|---|
| 01 | [Authentication and Access](./epics/01-authentication-and-access.md) | register, login, credential verification, current user, logout use cases |
| 02 | [Users and Roles](./epics/02-users-and-roles.md) | user record, account status, roles, role hierarchy, authorization guard |
| 03 | [JWT and Tokens](./epics/03-jwt-and-tokens.md) | token claims, signing, verification, expiry, the refresh/rotation protocol |
| 04 | [Session Management](./epics/04-session-management.md) | device sessions, refresh-token hashes, revocation, reuse detection, own-device endpoints |
| 05 | [Admin Management](./epics/05-admin-management.md) | `/users/**` admin endpoints, admin session control, admin seed |
| 06 | [Security](./epics/06-security.md) | cross-cutting security controls and forbidden anti-patterns |
| 07 | [API Contracts](./epics/07-api-contracts.md) | envelopes, error codes, status codes, endpoint index |
| 08 | [Database](./epics/08-database.md) | schema, constraints, indexes, migrations, retention |
| 09 | [Testing](./epics/09-testing.md) | test strategy, infrastructure, matrix, coverage gate |
| 10 | [Deployment and Operations](./epics/10-deployment-and-operations.md) | configuration, scripts, environments, production checklist |

Every epic starts with **Responsibility** and **Does Not Own**. If your task touches something an epic does not own, go to the owning epic. Do not re-specify it locally.

## 4. Cross-epic dependencies

- Each epic has a **Dependencies** section listing which epics it consumes. It uses them through their public contracts (services, guards, decorators, error codes), never by reaching into their internals.
- Module dependencies in code only flow one way: `AuthModule → UsersModule → RolesModule`. `UsersModule` must never import `AuthModule` (no `forwardRef`).
- When a change crosses epics (for example, "suspend user must also revoke sessions"), update **every owning epic** and say so in your summary.

```
01 Auth ──uses──▶ 02 Users/Roles, 03 Tokens, 04 Sessions
03 Tokens ─uses─▶ 04 Sessions (session binding, rotation storage)
04 Sessions ────▶ 02 Users (status), 08 Database
05 Admin ───────▶ 02 Users/Roles, 04 Sessions
06 Security, 07 API, 08 Database, 09 Testing, 10 Ops apply to all
```

## 5. Non-negotiable rules

1. **Inspect existing code before modifying it.** Every epic lists its code locations. Read them, and read the relevant tests, first.
2. **Security has priority.** If a request conflicts with [06-security.md](./epics/06-security.md) or `docs/specs/AUTH_SECURITY.md`, stop and report it. Never weaken a security rule to make something work.
3. **No change without tests.** Behaviour changes need new or updated tests. Bug fixes need a test that failed before the fix.
4. **Do not silently change architecture.** Keep module boundaries, the response envelope, error codes, token claims and the session model. If a change is necessary, explain it and record it in the Deviations table of `docs/specs/AUTH_IMPLEMENTATION_PLAN.md`.
5. **Validate against acceptance criteria.** A task is done only when the owning epic's acceptance criteria and required tests pass, together with these commands:

```bash
npm run lint && npm run typecheck && npm run build
npm test                 # unit
npm run test:e2e         # e2e on PostgreSQL
npm run test:cov         # unit + e2e with coverage thresholds
```

6. **Never commit secrets.** Only `.env.example` is tracked.
7. **Migrations are append-only.** Never edit a migration that has run.

## 6. Source of truth and conflicts

| Priority | Source |
|---|---|
| 1 | The implemented code and its passing tests |
| 2 | `docs/specs/AUTH_SECURITY.md` and [epics/06-security.md](./epics/06-security.md) |
| 3 | `docs/specs/*` (detailed technical specification) |
| 4 | `docs/project-requirements/*` (this responsibility-oriented layer) |

This folder **complements** `docs/specs`. It reorganizes the same decisions by responsibility and does not introduce new behaviour. If you find a contradiction, do not pick a side silently: report it, and fix the document that is wrong.

## 7. How to run

```bash
npm install                        # requires npm >= 11
cp .env.example .env               # set JWT secrets: openssl rand -base64 48
docker compose up -d               # PostgreSQL (auth_dev + auth_test)
npm run migration:run
npm run seed                       # optional initial ADMIN
npm run start:dev                  # http://localhost:3000/health
```

## 8. Documentation map (existing → new)

| Existing document (`docs/specs`) | Content | Now organized under |
|---|---|---|
| `README.md` | index, precedence, baseline | [START-PROMPT.md](./START-PROMPT.md), [tech-specs.md](./tech-specs.md) |
| `AUTH_REQUIREMENTS.md` §1 scope | scope, out of scope | [product-context.md](./product-context.md) |
| `AUTH_REQUIREMENTS.md` §3.1–3.4 (REG, LOGIN, PWD, EMAIL) | registration/login rules | [01](./epics/01-authentication-and-access.md) |
| `AUTH_REQUIREMENTS.md` §3.6 (GUARD), §3.8 (LOGOUT) | current user, logout | [01](./epics/01-authentication-and-access.md), [04](./epics/04-session-management.md) |
| `AUTH_REQUIREMENTS.md` §3.9 (ROLE), §3.10 (STATUS) | roles, status | [02](./epics/02-users-and-roles.md) |
| `AUTH_REQUIREMENTS.md` §3.9.1 (ADMIN), FR-S-08 | admin management, seed | [05](./epics/05-admin-management.md) |
| `AUTH_REQUIREMENTS.md` §3.5 (TOKEN), §3.7 (REFRESH) | tokens, refresh | [03](./epics/03-jwt-and-tokens.md), [04](./epics/04-session-management.md) |
| `AUTH_REQUIREMENTS.md` §3.11 (ERR) | error handling | [07](./epics/07-api-contracts.md) |
| `AUTH_REQUIREMENTS.md` §3.12 (CONF) | env variables | [10](./epics/10-deployment-and-operations.md) |
| `AUTH_REQUIREMENTS.md` §5, §6 | NFRs, future features | [product-context.md](./product-context.md), [09](./epics/09-testing.md), each epic |
| `AUTH_ARCHITECTURE.md` §3–4 | modules, dependency rules | START-PROMPT §4, each epic's *Code* section |
| `AUTH_ARCHITECTURE.md` §6 | component contracts | each owning epic |
| `AUTH_ARCHITECTURE.md` §8 | flows | [01](./epics/01-authentication-and-access.md), [03](./epics/03-jwt-and-tokens.md), [04](./epics/04-session-management.md) |
| `JWT_SPEC.md` | token model, rotation | [03](./epics/03-jwt-and-tokens.md) (rotation storage in [04](./epics/04-session-management.md)) |
| `AUTH_DATABASE.md` | schema, revocation model | [08](./epics/08-database.md) (revocation semantics in [04](./epics/04-session-management.md)) |
| `AUTH_SECURITY.md` | security controls, anti-patterns | [06](./epics/06-security.md) |
| `AUTH_API.md` §1–2, §4 | envelopes, codes, matrix | [07](./epics/07-api-contracts.md) |
| `AUTH_API.md` §3 endpoints | per-endpoint behaviour | the owning epic (01, 03, 04, 05) |
| `AUTH_IMPLEMENTATION_PLAN.md` | phases, tests, deviations | [09](./epics/09-testing.md) (tests); deviations log stays in the plan |
| `docs/security/AUTH_SECURITY_REVIEW.md` | review evidence | [06](./epics/06-security.md) |
| root `README.md` | setup, scripts | [10](./epics/10-deployment-and-operations.md) |
