# Authentication Specification Pack

This folder holds the specification for the **local email/password + JWT authentication system** of the reusable NestJS backend boilerplate. It is written for the human reviewers and the AI coding agents who will implement the system.

> Scope: local authentication **only**, implemented inside the NestJS backend. External identity providers (Google OAuth, Firebase Auth, Auth0, Clerk, etc.) are **out of scope**. The architecture keeps room to add them later without rewriting local auth.

> **AI agents: start at [`docs/project-requirements/START-PROMPT.md`](../project-requirements/START-PROMPT.md).** That folder reorganizes these specifications by responsibility (one epic per concern). The documents here remain the detailed technical reference.

## Reading order

| # | File | Purpose |
|---|------|---------|
| 1 | [AUTH_REQUIREMENTS.md](./AUTH_REQUIREMENTS.md) | Functional and non-functional requirements (MUST / SHOULD / OPTIONAL) with stable IDs |
| 2 | [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md) | Modules, responsibilities, dependency rules, directory layout, component contracts, auth and session flows |
| 3 | [AUTH_DATABASE.md](./AUTH_DATABASE.md) | `users`, `user_roles`, `auth_sessions`: columns, relationships, indexes, constraints, revocation model |
| 4 | [JWT_SPEC.md](./JWT_SPEC.md) | Access and refresh token model, claims, signing, validation, rotation, reuse detection |
| 5 | [AUTH_SECURITY.md](./AUTH_SECURITY.md) | Security controls, production requirements and the anti-patterns the implementation must avoid |
| 6 | [AUTH_API.md](./AUTH_API.md) | REST contract: endpoints, DTOs, validation, response envelopes, error codes |
| 7 | [AUTH_IMPLEMENTATION_PLAN.md](./AUTH_IMPLEMENTATION_PLAN.md) | 13-phase plan with files, dependencies, acceptance criteria, tests, pending decisions |

## Conventions used in these documents

- **MUST / MUST NOT / SHOULD / MAY** follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) meanings.
- Requirement IDs (for example `FR-LOGIN-03`, `SEC-HASH-01`) are stable. The implementation plan and tests refer to them.
- If two documents conflict, this order decides: `AUTH_SECURITY.md` > `JWT_SPEC.md` > `AUTH_DATABASE.md` > `AUTH_API.md` > `AUTH_ARCHITECTURE.md` > `AUTH_REQUIREMENTS.md` > `AUTH_IMPLEMENTATION_PLAN.md`. The implementing agent MUST report any conflict it finds instead of silently choosing one side.

## Repository baseline at time of writing (2026-09-24)

At the time of writing, the repository had **no commits and no source files**. No NestJS project, ORM, auth code, DTO conventions, config system or test setup existed to reuse. So the specs set the defaults below, chosen to match current NestJS ecosystem conventions:

| Concern | Default chosen | Latest stable seen on npm at time of writing |
|---|---|---|
| Runtime | Node.js LTS (>= 22; 24 recommended) | — |
| Framework | NestJS 12.x on the Express platform | `@nestjs/core` 12.1.0 |
| Package manager | npm (Nest CLI default) | npm 10.x |
| Database | PostgreSQL (>= 15) | — |
| ORM | TypeORM 1.x via `@nestjs/typeorm` | `typeorm` 1.1.1, `@nestjs/typeorm` 12.0.1 |
| Config | `@nestjs/config` + Joi schema validation | `@nestjs/config` 12.0.1, `joi` 18.x |
| JWT | `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` (no `passport-local`, see AUTH_ARCHITECTURE §5) | 12.0.2 / 12.0.0 / 4.0.1 |
| Password hashing | `argon2` (argon2id) | 0.45.1 |
| Validation | `class-validator` + `class-transformer` | 0.15.1 |
| Rate limiting | `@nestjs/throttler` | 6.7.0 |
| HTTP headers | `helmet` | 8.3.0 |
| Tests | Jest + Supertest (Nest CLI defaults) | — |

**Before writing any code, the implementing agent MUST re-inspect the repository** (Phase 1 of the implementation plan). If a project has been scaffolded in the meantime, its existing conventions (package manager, ORM, config style, DTO style, test layout) win over the defaults above. Any difference MUST be recorded in the `Baseline` section of `AUTH_IMPLEMENTATION_PLAN.md`.
