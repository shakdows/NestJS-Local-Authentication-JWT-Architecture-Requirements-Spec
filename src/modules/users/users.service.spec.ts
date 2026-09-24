import { Role } from '../roles/role.enum.js';
import { UserStatus } from './enums/user-status.enum.js';
import type { User } from './types/user.types.js';
import type { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

const user: User = {
  id: 'u1',
  email: 'user@example.com',
  roles: [Role.USER],
  status: UserStatus.ACTIVE,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setup() {
  const repo = {
    findById: vi.fn().mockResolvedValue(user),
    findByEmail: vi.fn().mockResolvedValue(user),
    findByEmailWithCredentials: vi
      .fn()
      .mockResolvedValue({ ...user, passwordHash: 'h' }),
    existsByEmail: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue(user),
    updateStatus: vi.fn(),
    setRoles: vi.fn(),
  };
  return {
    repo,
    service: new UsersService(repo as unknown as UsersRepository),
  };
}

describe('UsersService', () => {
  it('normalizes emails before every lookup (FR-EMAIL-01)', async () => {
    const { repo, service } = setup();
    await service.findByEmail(' User@Example.com ');
    await service.findByEmailWithCredentials('USER@example.com');
    await service.existsByEmail('User@EXAMPLE.com');
    expect(repo.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(repo.findByEmailWithCredentials).toHaveBeenCalledWith(
      'user@example.com',
    );
    expect(repo.existsByEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('creates users with USER / ACTIVE defaults and a normalized email (FR-REG-05)', async () => {
    const { repo, service } = setup();
    await service.create({ email: ' New@Example.com', passwordHash: 'hash' });
    expect(repo.create).toHaveBeenCalledWith({
      email: 'new@example.com',
      passwordHash: 'hash',
      roles: [Role.USER],
      status: UserStatus.ACTIVE,
    });
  });

  it('always keeps USER when roles are given (FR-ROLE-11)', async () => {
    const { repo, service } = setup();
    await service.create({
      email: 'a@b.co',
      passwordHash: 'h',
      roles: [Role.ADMIN],
    });
    expect(repo.create.mock.calls[0][0].roles).toEqual([Role.USER, Role.ADMIN]);
  });

  describe('admin operations (FR-ADMIN)', () => {
    it('forbids changing your own status (FR-ADMIN-06)', async () => {
      const { repo, service } = setup();
      await expect(
        service.updateStatus('u1', 'u1', UserStatus.SUSPENDED),
      ).rejects.toMatchObject({
        code: 'USER_SELF_MODIFICATION_FORBIDDEN',
      });
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('forbids removing your own ADMIN role', async () => {
      const { service } = setup();
      await expect(
        service.setRoles('u1', 'u1', [Role.USER]),
      ).rejects.toMatchObject({
        code: 'USER_SELF_MODIFICATION_FORBIDDEN',
      });
    });

    it('allows an admin to keep their own ADMIN role', async () => {
      const { repo, service } = setup();
      await service.setRoles('u1', 'u1', [Role.ADMIN]);
      expect(repo.setRoles).toHaveBeenCalledWith('u1', [Role.USER, Role.ADMIN]);
    });

    it('returns 404 for an unknown target', async () => {
      const { repo, service } = setup();
      repo.findById.mockResolvedValueOnce(null);
      await expect(
        service.updateStatus('admin', 'missing', UserStatus.ACTIVE),
      ).rejects.toMatchObject({
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('updates another user status', async () => {
      const { repo, service } = setup();
      await service.updateStatus('admin', 'u1', UserStatus.SUSPENDED);
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'u1',
        UserStatus.SUSPENDED,
      );
    });
  });
});
