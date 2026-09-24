# Epic 10 — Deployment and Operations

## Responsibility

This epic owns **running the system**:

- environment variables and their validation at startup
- local development setup (Docker, `.env`)
- npm scripts (build, start, migrate, seed, purge)
- production configuration and the go-live checklist
- operational jobs (migrations on deploy, session purge, first admin)

## Does Not Own

Schema design (08), security rules (06; this epic applies them), test strategy (09).

## Objective

Go from clone to a running, correctly configured API in minutes, and make misconfiguration fail loudly at boot instead of silently in production.

## Code

| Component | Path |
|---|---|
| Env schema + defaults + production rules | `src/config/env.validation.ts` |
| Config namespaces | `src/config/{app,auth,database,jwt}.config.ts` |
| Bootstrap | `src/main.ts`, `src/app.setup.ts` |
| Health check | `src/health/health.controller.ts` (`GET /health`) |
| Local DB | `docker-compose.yml`, `docker/postgres-init.sql` |
| Env template | `.env.example` |

## Environment variables

| Variable | Default | Rule |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `3000` | port |
| `API_PREFIX` | *(empty)* | no leading/trailing `/` |
| `CORS_ORIGINS` | *(empty = off)* | comma list; `*` forbidden in production |
| `TRUST_PROXY` | `false` | `true`/`false`/hop count |
| `DATABASE_URL` | **required** | `postgres(ql)://` |
| `DATABASE_SSL` | `false` | boolean |
| `DATABASE_LOGGING` | `false` | must be false in production |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **required** | ≥ 32 chars, different, not placeholders in production |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | `\d+[smhd]`, ≤ 1h |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | ≤ 30d, > access |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `nestjs-boilerplate` / `nestjs-boilerplate-api` | |
| `AUTH_ARGON2_MEMORY_COST` / `_TIME_COST` / `_PARALLELISM` | `19456` / `2` / `1` | can only go up |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | `60` / `100` | global default |
| `THROTTLE_ENABLED` | `true` | test-only switch; must be true in production |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | — | seed script only |

Code never reads `process.env` directly outside `src/config/**` and `src/database/data-source.ts`.

## Local setup

```bash
npm install                       # npm >= 11 (npm 10 crashes on this tree)
cp .env.example .env              # replace both JWT secrets: openssl rand -base64 48
docker compose up -d              # PostgreSQL with auth_dev + auth_test
npm run migration:run
npm run seed                      # optional: initial ADMIN
npm run start:dev                 # GET http://localhost:3000/health
```

## Scripts

| Script | Purpose |
|---|---|
| `start:dev` / `start:prod` | watch mode / run `dist/main.js` |
| `build` · `typecheck` · `lint` · `format` | compile · type-check incl. tests · oxlint · prettier |
| `migration:run` / `revert` / `show` / `generate` / `create` | TypeORM CLI via tsx |
| `seed` | build + create `SEED_ADMIN_EMAIL` as ADMIN (idempotent; production needs `--force`) |
| `db:purge-sessions` | delete sessions ended more than 30 days ago |
| `test` · `test:e2e` · `test:cov` | see epic 09 |

## Business rules

- The app **refuses to start** on invalid configuration (FR-CONF-02), listing every problem.
- Migrations run as an explicit deploy step, never automatically at boot.
- The first admin is created by the seed. There is no API to self-promote.

## Production checklist

- [ ] HTTPS only (TLS at load balancer/proxy); HSTS active (`NODE_ENV=production`).
- [ ] Strong unique JWT secrets from a secret manager; `DATABASE_SSL=true` for remote DBs.
- [ ] `CORS_ORIGINS` = exact frontend origins.
- [ ] `TRUST_PROXY` matches the proxy hops.
- [ ] Single instance, **or** shared throttler storage (Redis) configured.
- [ ] `npm run migration:run` executed; `DATABASE_LOGGING=false`.
- [ ] `db:purge-sessions` scheduled daily.
- [ ] Seed not run with example credentials; seed variables removed after first run.
- [ ] `npm audit --omit=dev` clean at high/critical.
- [ ] Liveness probe on `GET /health`.

## Technical rules

- Build output: `dist/` (ESM). Run with `node dist/main.js` on Node ≥ 22.
- `argon2` ships prebuilt binaries. If a platform lacks one, allow its install script (`npm install-scripts approve argon2`).
- The seed uses the compiled build because `tsx` lacks decorator metadata. Migrations and purge use tsx directly.

## Dependencies

Operates epic 08 (migrations, purge) and epic 05 (seed). Applies epic 06 rules via env validation.

## Security considerations

- Only `.env.example` is committed. `.env` and `.env.*` are git-ignored.
- Rotating `JWT_REFRESH_SECRET` forces every user to log in again. Rotating `JWT_ACCESS_SECRET` invalidates access tokens, and clients recover via refresh.

## Acceptance criteria

- [ ] A missing or invalid secret stops the boot with a clear message.
- [ ] Following "Local setup" on a clean machine yields `GET /health` → `{"success":true,"data":{"status":"ok"}}`.
- [ ] Production rules (CORS `*`, placeholders, DB logging, throttling off) are rejected at boot.

## Required tests

| Test | File |
|---|---|
| Env validation incl. production rules | `src/config/env.validation.spec.ts` |
| Duration parsing | `src/config/duration.util.spec.ts` |
| Boot pipeline (health, headers, CORS) | `test/app.e2e-spec.ts` |
