import { QueryFailedError, type DataSource, type Repository } from 'typeorm';
import { Role } from '../roles/role.enum.js';
import type { UserEntity } from './entities/user.entity.js';
import { UserStatus } from './enums/user-status.enum.js';
import { UsersRepository } from './users.repository.js';

function repoWithTransactionError(error: unknown) {
  const dataSource = {
    transaction: vi.fn().mockRejectedValue(error),
  } as unknown as DataSource;
  return new UsersRepository({} as Repository<UserEntity>, dataSource);
}

const input = {
  email: 'a@example.com',
  passwordHash: 'h',
  roles: [Role.USER],
  status: UserStatus.ACTIVE,
};
const dbError = (driverError: object) =>
  new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('db'), driverError),
  );

describe('UsersRepository.create error mapping (FR-REG-07)', () => {
  it('maps the uq_users_email violation to AUTH_EMAIL_ALREADY_EXISTS', async () => {
    const repo = repoWithTransactionError(
      dbError({ code: '23505', constraint: 'uq_users_email' }),
    );
    await expect(repo.create(input)).rejects.toMatchObject({
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
    });
  });

  it('rethrows other unique violations unchanged (they are bugs, not duplicates)', async () => {
    const error = dbError({ code: '23505', constraint: 'pk_user_roles' });
    await expect(repoWithTransactionError(error).create(input)).rejects.toBe(
      error,
    );
  });

  it('rethrows non-database errors unchanged', async () => {
    const error = new Error('connection lost');
    await expect(repoWithTransactionError(error).create(input)).rejects.toBe(
      error,
    );
  });
});
