import { Role } from './role.enum.js';
import { RolesService } from './roles.service.js';

describe('RolesService (FR-ROLE-03/04)', () => {
  const service = new RolesService();

  it('expands ADMIN to include USER', () => {
    expect(service.expand([Role.ADMIN])).toEqual(
      new Set([Role.ADMIN, Role.USER]),
    );
  });

  it('does not expand USER upwards', () => {
    expect(service.expand([Role.USER])).toEqual(new Set([Role.USER]));
  });

  it('ADMIN passes a USER requirement (hierarchy)', () => {
    expect(service.hasAnyRole([Role.ADMIN], [Role.USER])).toBe(true);
  });

  it('USER fails an ADMIN requirement', () => {
    expect(service.hasAnyRole([Role.USER], [Role.ADMIN])).toBe(false);
  });

  it('matches when the user holds any of several required roles', () => {
    expect(service.hasAnyRole([Role.USER], [Role.USER, Role.ADMIN])).toBe(true);
  });

  it('an empty requirement always passes', () => {
    expect(service.hasAnyRole([], [])).toBe(true);
  });

  it('no roles never satisfies a requirement', () => {
    expect(service.hasAnyRole([], [Role.USER])).toBe(false);
  });
});
