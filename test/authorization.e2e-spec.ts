import { Controller, Get, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Auth } from '../src/modules/auth/decorators/auth.decorator.js';
import { CurrentUser } from '../src/modules/auth/decorators/current-user.decorator.js';
import { Roles } from '../src/modules/auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard.js';
import { Role } from '../src/modules/roles/role.enum.js';
import { RolesModule } from '../src/modules/roles/roles.module.js';
import { grantAdmin, http, login, register } from './utils/auth-helpers.js';
import { decode } from './utils/token-forge.js';
import { resetDatabase } from './utils/reset-database.js';
import { DataSource } from 'typeorm';

/** Probe routes mirroring the documented usage patterns. */
@Controller('probe')
class ProbeController {
  @Get('admin')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  admin() {
    return { message: 'Admin access granted' };
  }

  @Get('profile')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  profile(@CurrentUser('id') id: string) {
    return { id };
  }

  @Get('user-only')
  @Auth(Role.USER)
  userOnly() {
    return { ok: true };
  }

  @Get('roles-without-auth-guard')
  @Roles(Role.USER)
  @UseGuards(RolesGuard)
  misconfigured() {
    return { leaked: true };
  }
}

describe('Role-based authorization (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, RolesModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
    configureApp(app);
    await app.init();
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  async function asUser() {
    const user = await register(app, 'user@example.com');
    return { user, tokens: await login(app, 'user@example.com') };
  }
  async function asAdmin() {
    const admin = await register(app, 'admin@example.com');
    await grantAdmin(app, admin.id);
    return { admin, tokens: await login(app, 'admin@example.com') };
  }
  const get = (path: string, token?: string) => {
    const req = http(app).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('authenticated USER on a USER route → 200', async () => {
    const { user, tokens } = await asUser();
    const res = await get('/probe/profile', tokens.accessToken).expect(200);
    expect(res.body.data).toEqual({ id: user.id });
    await get('/probe/user-only', tokens.accessToken).expect(200);
  });

  it('unauthenticated user → 401', async () => {
    const res = await get('/probe/admin').expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_MISSING');
    await get('/probe/profile').expect(401);
  });

  it('valid role: ADMIN on an ADMIN route → 200', async () => {
    const { tokens } = await asAdmin();
    const res = await get('/probe/admin', tokens.accessToken).expect(200);
    expect(res.body.data).toEqual({ message: 'Admin access granted' });
  });

  it('hierarchy: ADMIN passes @Roles(Role.USER)', async () => {
    const { tokens } = await asAdmin();
    await get('/probe/user-only', tokens.accessToken).expect(200);
  });

  it('invalid role: USER on an ADMIN route → 403 AUTH_FORBIDDEN', async () => {
    const { tokens } = await asUser();
    const res = await get('/probe/admin', tokens.accessToken).expect(403);
    expect(res.body.error).toMatchObject({ code: 'AUTH_FORBIDDEN', message: 'Insufficient permissions' });
  });

  it('FR-ROLE-05: role removed in the DB → 403 even though the JWT claim still says ADMIN', async () => {
    const { admin, tokens } = await asAdmin();
    expect(decode<{ roles: string[] }>(tokens.accessToken).roles).toContain('ADMIN');
    await app.get(DataSource).query(`DELETE FROM user_roles WHERE user_id = $1 AND role = 'ADMIN'`, [admin.id]);
    await get('/probe/admin', tokens.accessToken).expect(403);
  });

  it('role granted in the DB applies on the next request without a new login', async () => {
    const { user, tokens } = await asUser();
    await get('/probe/admin', tokens.accessToken).expect(403);
    await grantAdmin(app, user.id);
    await get('/probe/admin', tokens.accessToken).expect(200);
  });

  it('FR-ROLE-06: RolesGuard without JwtAuthGuard fails closed', async () => {
    const { tokens } = await asUser();
    const res = await get('/probe/roles-without-auth-guard', tokens.accessToken).expect(401);
    expect(res.body.data).toBeUndefined();
  });
});
