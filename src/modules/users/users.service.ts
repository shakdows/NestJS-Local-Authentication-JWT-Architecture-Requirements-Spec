import { Injectable } from '@nestjs/common';
import { Role } from '../roles/role.enum.js';
import { UserStatus } from './enums/user-status.enum.js';
import type {
  CreateUserInput,
  ListUsersQuery,
  User,
  UserStats,
  UserWithCredentials,
} from './types/user.types.js';
import { UsersErrors } from './users.errors.js';
import { UsersRepository } from './users.repository.js';
import { normalizeEmail } from './utils/normalize-email.js';

/**
 * Owns the user record: persistence, retrieval, status and roles.
 * Knows nothing about passwords (it stores an opaque hash), tokens or sessions.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /** Returns the user or null. */
  findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  /** Looks up by email after normalizing it (FR-EMAIL-01). */
  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(normalizeEmail(email));
  }

  /** Like {@link findByEmail} but includes `passwordHash`. Reserved for AuthService. */
  findByEmailWithCredentials(email: string): Promise<UserWithCredentials | null> {
    return this.usersRepository.findByEmailWithCredentials(normalizeEmail(email));
  }

  /** True when a user with this (normalized) email exists. */
  existsByEmail(email: string): Promise<boolean> {
    return this.usersRepository.existsByEmail(normalizeEmail(email));
  }

  /**
   * Creates a user. Defaults: roles `[USER]`, status `ACTIVE`. `USER` is always included
   * (FR-ROLE-11). Throws `AUTH_EMAIL_ALREADY_EXISTS` on duplicates, including races.
   */
  create(input: CreateUserInput): Promise<User> {
    return this.usersRepository.create({
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      roles: this.withBaseRole(input.roles ?? [Role.USER]),
      status: input.status ?? UserStatus.ACTIVE,
    });
  }

  /** Replaces the stored password hash (e.g. Argon2 re-hash on login). */
  updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    return this.usersRepository.updatePasswordHash(id, passwordHash);
  }

  /** Records a successful login. */
  updateLastLoginAt(id: string, at: Date = new Date()): Promise<void> {
    return this.usersRepository.updateLastLoginAt(id, at);
  }

  /** Returns the user or throws `404 RESOURCE_NOT_FOUND`. */
  async getByIdOrFail(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw UsersErrors.notFound();
    return user;
  }

  /** Paginated, filtered list for administrators (FR-ADMIN-01). */
  list(query: ListUsersQuery): Promise<{ items: User[]; total: number }> {
    return this.usersRepository.list(query);
  }

  /** Counts by status and role (FR-ADMIN-02). */
  getStats(): Promise<UserStats> {
    return this.usersRepository.getStats();
  }

  /**
   * Admin status change (FR-ADMIN-04). An admin cannot change their own status (FR-ADMIN-06).
   * Takes effect immediately because auth checks status on every request.
   */
  async updateStatus(actorId: string, id: string, status: UserStatus): Promise<User> {
    if (actorId === id) throw UsersErrors.selfModificationForbidden();
    await this.getByIdOrFail(id);
    await this.usersRepository.updateStatus(id, status);
    return this.getByIdOrFail(id);
  }

  /**
   * Admin role replacement (FR-ADMIN-05). `USER` is always kept (FR-ROLE-11), and an admin
   * cannot remove their own ADMIN role (FR-ADMIN-06).
   */
  async setRoles(actorId: string, id: string, roles: Role[]): Promise<User> {
    const next = this.withBaseRole(roles);
    if (actorId === id && !next.includes(Role.ADMIN)) {
      throw UsersErrors.selfModificationForbidden();
    }
    await this.getByIdOrFail(id);
    await this.usersRepository.setRoles(id, next);
    return this.getByIdOrFail(id);
  }

  private withBaseRole(roles: Role[]): Role[] {
    return [...new Set([Role.USER, ...roles])];
  }
}
