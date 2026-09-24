import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../roles/role.enum.js';
import { RolesService } from '../../roles/roles.service.js';
import { RolesGuard } from './roles.guard.js';

function context(user: unknown) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (FR-ROLE-03..07)', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector, new RolesService());
  const withRoles = (roles: Role[] | undefined) => vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  afterEach(() => vi.restoreAllMocks());

  it('allows routes without @Roles metadata', () => {
    withRoles(undefined);
    expect(guard.canActivate(context(undefined))).toBe(true);
  });

  it('fails closed with 401 when @Roles is present but there is no user', () => {
    withRoles([Role.USER]);
    expect(() => guard.canActivate(context(undefined))).toThrow(expect.objectContaining({ code: 'AUTH_TOKEN_MISSING' }));
  });

  it('allows a matching role', () => {
    withRoles([Role.ADMIN]);
    expect(guard.canActivate(context({ roles: [Role.USER, Role.ADMIN] }))).toBe(true);
  });

  it('allows ADMIN on a USER route (hierarchy)', () => {
    withRoles([Role.USER]);
    expect(guard.canActivate(context({ roles: [Role.ADMIN] }))).toBe(true);
  });

  it('denies a non-matching role with 403 AUTH_FORBIDDEN', () => {
    withRoles([Role.ADMIN]);
    expect(() => guard.canActivate(context({ roles: [Role.USER] }))).toThrow(
      expect.objectContaining({ code: 'AUTH_FORBIDDEN' }),
    );
  });
});
