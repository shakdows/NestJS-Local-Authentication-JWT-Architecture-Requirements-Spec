# Technical Specifications

This is the single place where the stack is defined. Epics reference it and do not repeat it.

| Concern | Choice | Version in use | Notes |
|---|---|---|---|
| Framework | NestJS (Express platform) | `@nestjs/core` 12.1 | Scaffolded with `@nestjs/cli` 12 |
| Language | TypeScript | 6.0 | `strict: true`. **ESM** (`"type": "module"`), so relative imports use `.js` suffixes. |
| Runtime | Node.js | ≥ 22 (`.nvmrc`: 24) | |
| Package manager | npm | **≥ 11** | npm 10 crashes on this dependency tree |
| Database | PostgreSQL | ≥ 15 (tested on 16) | `docker-compose.yml` provided |
| ORM | TypeORM via `@nestjs/typeorm` | typeorm 1.1 | `synchronize: false`; migrations only; explicit entity/migration lists |
| Authentication | JWT via `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` | 12.0 / 12.0 / 4.0 | HS256; separate access/refresh secrets. No `passport-local`. |
| Password hashing | `argon2` (argon2id) | 0.45 | m=19456 KiB, t=2, p=1 minimum |
| Refresh-token hashing | SHA-256 (`node:crypto`) | — | never bcrypt |
| Validation | `class-validator` + `class-transformer` | 0.15 / 0.5 | global `ValidationPipe` (whitelist, forbid unknown) |
| Configuration | `@nestjs/config` + `joi` | 12.0 / 18 | typed namespaces `app`, `auth`, `database`, `jwt` |
| Security headers | `helmet` | 8.3 | HSTS in production |
| CORS | Nest built-in | — | explicit origin allowlist |
| Rate limiting | `@nestjs/throttler` | 6.7 | in-memory storage (single instance) |
| Unit tests | Vitest | 4.1 | `src/**/*.spec.ts` |
| E2E tests | Vitest + Supertest | 4.1 / 7.x | `test/**/*.e2e-spec.ts`, real PostgreSQL |
| Coverage | `@vitest/coverage-v8` | 4.1 | thresholds in `vitest.config.coverage.ts` |
| Lint / format | oxlint + Prettier | 1.x / 3.x | Nest 12 scaffold defaults |
| Script runner | tsx | 4.x | TypeORM CLI and purge script (no DI needed) |

## Architecture at a glance

```
src/
  main.ts, app.module.ts, app.setup.ts   bootstrap, global pipe/filter/interceptor/throttler, helmet/CORS
  config/                                env validation + typed config namespaces
  common/                                error codes, AppException, filter, interceptor, pipes, decorators
  database/                              TypeORM options, CLI data source, migrations, seeds, scripts
  modules/
    auth/                                epics 01, 03, 04 (+ RolesGuard/decorators used by 02 and 05)
    users/                               epics 02, 05
    roles/                               epic 02
test/                                    e2e suites and helpers
```

## Fixed conventions

- Response envelope: `{ success: true, data }` / `{ success: false, error: { statusCode, code, message, details, timestamp, path } }` (epic 07).
- Filenames are kebab-case with Nest suffixes. DB columns are snake_case, TS properties camelCase.
- Only `*.repository.ts` files use TypeORM. Controllers make one service call per handler.
- Config is read through typed namespaces, never `process.env`, except in `src/config/**` and `src/database/data-source.ts`.
