import { Role } from '../../roles/role.enum.js';
import { UserStatus } from '../enums/user-status.enum.js';
import type { UserWithCredentials } from '../types/user.types.js';
import { toUserResponse } from './user.mapper.js';

describe('toUserResponse (SEC-PWD-03)', () => {
  const user: UserWithCredentials = {
    id: '8f1c2e5a-0b7d-4c1e-9a55-2d3f1b6c7e90',
    email: 'user@example.com',
    roles: [Role.USER],
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date('2026-09-01T08:30:00.000Z'),
    updatedAt: new Date('2026-09-24T12:00:00.000Z'),
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$secret',
  };

  it('returns exactly the public fields, never the password hash', () => {
    const response = toUserResponse(user);
    expect(Object.keys(response).sort()).toEqual(
      ['createdAt', 'email', 'id', 'lastLoginAt', 'roles', 'status', 'updatedAt'],
    );
    expect(JSON.stringify(response)).not.toContain('argon2');
  });

  it('serializes dates as ISO strings', () => {
    expect(toUserResponse({ ...user, lastLoginAt: new Date('2026-09-24T12:00:00.000Z') })).toMatchObject({
      lastLoginAt: '2026-09-24T12:00:00.000Z',
      createdAt: '2026-09-01T08:30:00.000Z',
    });
  });
});
