import { Injectable } from '@nestjs/common';
import { Role } from '../roles/role.enum.js';
import { UserStatus } from '../users/enums/user-status.enum.js';
import { toUserResponse } from '../users/mappers/user.mapper.js';
import { UsersService } from '../users/users.service.js';
import { AuthErrors } from './auth.errors.js';
import type { RegisterResponseDto } from './dto/auth-response.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { PasswordService } from './services/password.service.js';

/** Orchestrates authentication use cases; delegates to single-purpose services. */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Creates a local account (FR-REG). Roles and status are server-defined: `[USER]` / `ACTIVE`.
   * Does not issue tokens or create a session.
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    if (await this.usersService.existsByEmail(dto.email)) {
      throw AuthErrors.emailAlreadyExists();
    }
    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      roles: [Role.USER],
      status: UserStatus.ACTIVE,
    });
    return { user: toUserResponse(user) };
  }
}
