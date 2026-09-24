import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Role, ROLE_ORDER } from '../roles/role.enum.js';
import { UserRoleEntity } from './entities/user-role.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { UserStatus } from './enums/user-status.enum.js';
import type {
  CreateUserInput,
  ListUsersQuery,
  User,
  UserStats,
  UserWithCredentials,
} from './types/user.types.js';
import { UsersErrors } from './users.errors.js';

const UNIQUE_VIOLATION = '23505';
const EMAIL_UNIQUE_CONSTRAINT = 'uq_users_email';

function sortRoles(roles: Role[]): Role[] {
  return [...new Set(roles)].sort(
    (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b),
  );
}

function toUser(entity: UserEntity): User {
  return {
    id: entity.id,
    email: entity.email,
    roles: sortRoles((entity.roles ?? []).map((r) => r.role)),
    status: entity.status,
    lastLoginAt: entity.lastLoginAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return (
    driverError.code === UNIQUE_VIOLATION &&
    driverError.constraint === EMAIL_UNIQUE_CONSTRAINT
  );
}

/** Escapes LIKE wildcards so user-supplied search text is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The only class that touches the `users` / `user_roles` tables (NFR-04).
 * Maps entities to domain objects; `passwordHash` is only selected by
 * {@link findByEmailWithCredentials}.
 */
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private baseQuery(): SelectQueryBuilder<UserEntity> {
    return this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role');
  }

  async findById(id: string): Promise<User | null> {
    const entity = await this.baseQuery()
      .where('user.id = :id', { id })
      .getOne();
    return entity ? toUser(entity) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.baseQuery()
      .where('user.email = :email', { email })
      .getOne();
    return entity ? toUser(entity) : null;
  }

  async findByEmailWithCredentials(
    email: string,
  ): Promise<UserWithCredentials | null> {
    const entity = await this.baseQuery()
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
    return entity
      ? { ...toUser(entity), passwordHash: entity.passwordHash }
      : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.users.exists({ where: { email } });
  }

  /** Inserts the user and its roles in one transaction. Maps the email unique violation (FR-REG-07). */
  async create(input: Required<CreateUserInput>): Promise<User> {
    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const inserted = await manager.insert(UserEntity, {
          email: input.email,
          passwordHash: input.passwordHash,
          status: input.status,
        });
        const userId = inserted.identifiers[0].id as string;
        await manager.insert(
          UserRoleEntity,
          sortRoles(input.roles).map((role) => ({ userId, role })),
        );
        return userId;
      });
      return (await this.findById(id)) as User;
    } catch (error) {
      if (isEmailUniqueViolation(error)) throw UsersErrors.emailAlreadyExists();
      throw error;
    }
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.users.update({ id }, { passwordHash });
  }

  async updateLastLoginAt(id: string, at: Date): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: at });
  }

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    await this.users.update({ id }, { status });
  }

  /** Replaces the user's roles atomically. */
  async setRoles(id: string, roles: Role[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UserRoleEntity, { userId: id });
      await manager.insert(
        UserRoleEntity,
        sortRoles(roles).map((role) => ({ userId: id, role })),
      );
      // Touch updated_at so the change is visible on the user record.
      await manager.update(UserEntity, { id }, { updatedAt: new Date() });
    });
  }

  async list(query: ListUsersQuery): Promise<{ items: User[]; total: number }> {
    // Filter on ids first so the role join does not truncate each user's role list.
    const ids = this.users.createQueryBuilder('u').select('u.id');
    if (query.status)
      ids.andWhere('u.status = :status', { status: query.status });
    if (query.search) {
      ids.andWhere(`u.email ILIKE :search ESCAPE '\\'`, {
        search: `%${escapeLike(query.search)}%`,
      });
    }
    if (query.role) {
      ids.andWhere(
        'EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = :role)',
        { role: query.role },
      );
    }
    const total = await ids.getCount();
    const page = await ids
      .orderBy('u.created_at', 'DESC')
      .addOrderBy('u.id', 'ASC')
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getMany();
    if (page.length === 0) return { items: [], total };

    const entities = await this.baseQuery()
      .where('user.id IN (:...ids)', { ids: page.map((u) => u.id) })
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'ASC')
      .getMany();
    return { items: entities.map(toUser), total };
  }

  async getStats(): Promise<UserStats> {
    const byStatus = Object.fromEntries(
      Object.values(UserStatus).map((status) => [status, 0]),
    ) as Record<UserStatus, number>;
    const byRole = Object.fromEntries(
      ROLE_ORDER.map((role) => [role, 0]),
    ) as Record<Role, number>;

    const statusRows: { status: UserStatus; count: string }[] = await this.users
      .createQueryBuilder('u')
      .select('u.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.status')
      .getRawMany();
    for (const row of statusRows) byStatus[row.status] = Number(row.count);

    const roleRows: { role: Role; count: string }[] = await this.dataSource
      .getRepository(UserRoleEntity)
      .createQueryBuilder('r')
      .select('r.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.role')
      .getRawMany();
    for (const row of roleRows) byRole[row.role] = Number(row.count);

    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return { total, byStatus, byRole };
  }
}
