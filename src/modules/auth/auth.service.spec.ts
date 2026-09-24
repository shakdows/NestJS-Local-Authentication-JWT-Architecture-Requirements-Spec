import { Role } from '../roles/role.enum.js';
import { UserStatus } from '../users/enums/user-status.enum.js';
import type { User } from '../users/types/user.types.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { PasswordService } from './services/password.service.js';

const user: User = {
  id: 'u1',
  email: 'user@example.com',
  roles: [Role.USER],
  status: UserStatus.ACTIVE,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function createMocks() {
  const users = {
    existsByEmail: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    findByEmailWithCredentials: vi.fn(),
    updateLastLoginAt: vi.fn(),
    updatePasswordHash: vi.fn(),
  };
  const passwords = {
    hash: vi.fn().mockResolvedValue('hashed'),
    verify: vi.fn(),
    verifyDummy: vi.fn().mockResolvedValue(false),
    needsRehash: vi.fn().mockReturnValue(false),
  };
  return { users, passwords };
}

describe('AuthService.register (FR-REG)', () => {
  it('rejects an existing email with 409 before hashing', async () => {
    const { users, passwords } = createMocks();
    users.existsByEmail.mockResolvedValue(true);
    const service = new AuthService(users as unknown as UsersService, passwords as unknown as PasswordService);
    await expect(service.register({ email: 'user@example.com', password: 'Password1' })).rejects.toMatchObject({
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
    });
    expect(passwords.hash).not.toHaveBeenCalled();
  });

  it('hashes the password and creates a USER/ACTIVE account', async () => {
    const { users, passwords } = createMocks();
    const service = new AuthService(users as unknown as UsersService, passwords as unknown as PasswordService);
    const result = await service.register({ email: 'user@example.com', password: 'Password1' });
    expect(passwords.hash).toHaveBeenCalledWith('Password1');
    expect(users.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      passwordHash: 'hashed',
      roles: [Role.USER],
      status: UserStatus.ACTIVE,
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.email).toBe('user@example.com');
  });
});
