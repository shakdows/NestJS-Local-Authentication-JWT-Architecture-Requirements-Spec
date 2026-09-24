import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ClientContext } from '../../common/types/client-context.type.js';
import { Role } from '../roles/role.enum.js';
import { UserStatus } from '../users/enums/user-status.enum.js';
import { toUserResponse } from '../users/mappers/user.mapper.js';
import type { User, UserWithCredentials } from '../users/types/user.types.js';
import { UsersService } from '../users/users.service.js';
import { AuthErrors } from './auth.errors.js';
import type {
  LoginResponseDto,
  ProfileResponseDto,
  RegisterResponseDto,
  TokensResponseDto,
} from './dto/auth-response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';
import { SessionsService } from './sessions/sessions.service.js';

/** Orchestrates authentication use cases; delegates to single-purpose services. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionsService: SessionsService,
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

  /**
   * Email/password login (FR-LOGIN): verifies credentials, then status, then creates a new
   * session and returns the user with a token pair.
   */
  async login(dto: LoginDto, ctx: ClientContext): Promise<LoginResponseDto> {
    const user = await this.validateCredentials(dto.email, dto.password);
    if (this.passwordService.needsRehash(user.passwordHash)) {
      await this.usersService.updatePasswordHash(user.id, await this.passwordService.hash(dto.password));
    }
    const tokens = await this.issueSession(user, ctx);
    const lastLoginAt = new Date();
    await this.usersService.updateLastLoginAt(user.id, lastLoginAt);
    const { passwordHash: _omit, ...publicUser } = user;
    return { user: toUserResponse({ ...publicUser, lastLoginAt }), ...tokens };
  }

  /**
   * Returns the user when the password matches and the account is ACTIVE.
   * Unknown email and wrong password are indistinguishable, including timing (SEC-ENUM-01/02);
   * status is only revealed after the password is verified (SEC-ENUM-03).
   */
  async validateCredentials(email: string, password: string): Promise<UserWithCredentials> {
    const user = await this.usersService.findByEmailWithCredentials(email);
    if (!user) {
      await this.passwordService.verifyDummy(password);
      this.logger.warn({ event: 'auth.login.failed', reason: 'invalid_credentials' });
      throw AuthErrors.invalidCredentials();
    }
    if (!(await this.passwordService.verify(user.passwordHash, password))) {
      this.logger.warn({ event: 'auth.login.failed', reason: 'invalid_credentials', userId: user.id });
      throw AuthErrors.invalidCredentials();
    }
    if (user.status !== UserStatus.ACTIVE) {
      this.logger.warn({ event: 'auth.login.failed', reason: 'account_not_active', userId: user.id });
      throw AuthErrors.accountNotActive(user.status);
    }
    return user;
  }

  /**
   * Creates a session and its first token pair. The single seam every future way of proving
   * identity (OAuth, MFA, magic link) ends with (AUTH_ARCHITECTURE §6.6).
   */
  async issueSession(user: Pick<User, 'id' | 'email' | 'roles'>, ctx: ClientContext): Promise<TokensResponseDto> {
    const sessionId = randomUUID();
    const tokens = await this.generateTokens(user, sessionId);
    await this.sessionsService.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: this.tokenService.hashRefreshToken(tokens.refreshToken),
      expiresAt: tokens.refreshExpiresAt,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    this.logger.log({ event: 'auth.login.succeeded', userId: user.id, sessionId, ip: ctx.ipAddress });
    return this.toTokensResponse(tokens);
  }

  /** Current user's profile, read fresh from the database (FR-GUARD-05). */
  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) throw AuthErrors.tokenInvalid();
    return { user: toUserResponse(user) };
  }

  private async generateTokens(user: Pick<User, 'id' | 'email' | 'roles'>, sessionId: string) {
    const accessToken = await this.tokenService.signAccessToken(user, sessionId);
    const refresh = await this.tokenService.signRefreshToken(user.id, sessionId);
    return { accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
  }

  private toTokensResponse(tokens: { accessToken: string; refreshToken: string }): TokensResponseDto {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.accessTokenTtlSeconds,
    };
  }
}
