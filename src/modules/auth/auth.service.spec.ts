import { Role } from '../roles/role.enum.js';
import { UserStatus } from '../users/enums/user-status.enum.js';
import type { User } from '../users/types/user.types.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { PasswordService } from './services/password.service.js';
import type { TokenService } from './services/token.service.js';
import { SessionRevokedReason } from './sessions/enums/session-revoked-reason.enum.js';
import type { SessionsService } from './sessions/sessions.service.js';

const user: User = {
  id: 'u1',
  email: 'user@example.com',
  roles: [Role.USER],
  status: UserStatus.ACTIVE,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const ctx = { ipAddress: '203.0.113.7', userAgent: 'test-agent' };

function setup() {
  const users = {
    existsByEmail: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    findByEmailWithCredentials: vi.fn().mockResolvedValue({ ...user, passwordHash: 'stored-hash' }),
    updateLastLoginAt: vi.fn(),
    updatePasswordHash: vi.fn(),
  };
  const passwords = {
    hash: vi.fn().mockResolvedValue('hashed'),
    verify: vi.fn().mockResolvedValue(true),
    verifyDummy: vi.fn().mockResolvedValue(false),
    needsRehash: vi.fn().mockReturnValue(false),
  };
  const tokens = {
    signAccessToken: vi.fn().mockResolvedValue('access.jwt'),
    signRefreshToken: vi.fn().mockResolvedValue({ token: 'refresh.jwt', expiresAt: new Date('2026-02-01T00:00:00Z') }),
    hashRefreshToken: vi.fn((t: string) => `sha256(${t})`),
    accessTokenTtlSeconds: 900,
  };
  const sessions = {
    create: vi.fn(),
    rotate: vi.fn().mockResolvedValue(true),
    revokeForReuse: vi.fn(),
    revoke: vi.fn().mockResolvedValue(1),
    revokeAllForUser: vi.fn().mockResolvedValue(3),
  };
  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    tokens as unknown as TokenService,
    sessions as unknown as SessionsService,
  );
  return { service, users, passwords, tokens, sessions };
}

describe('AuthService', () => {
  describe('register (FR-REG)', () => {
    it('rejects an existing email with 409 before hashing', async () => {
      const { service, users, passwords } = setup();
      users.existsByEmail.mockResolvedValue(true);
      await expect(service.register({ email: 'user@example.com', password: 'Password1' })).rejects.toMatchObject({
        code: 'AUTH_EMAIL_ALREADY_EXISTS',
      });
      expect(passwords.hash).not.toHaveBeenCalled();
    });

    it('hashes the password and creates a USER/ACTIVE account', async () => {
      const { service, users, passwords } = setup();
      const result = await service.register({ email: 'user@example.com', password: 'Password1' });
      expect(passwords.hash).toHaveBeenCalledWith('Password1');
      expect(users.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        passwordHash: 'hashed',
        roles: [Role.USER],
        status: UserStatus.ACTIVE,
      });
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('validateCredentials (FR-LOGIN-02..05, SEC-ENUM)', () => {
    it('runs a dummy verify for an unknown email and returns 401', async () => {
      const { service, users, passwords } = setup();
      users.findByEmailWithCredentials.mockResolvedValue(null);
      await expect(service.validateCredentials('nobody@example.com', 'x')).rejects.toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
      });
      expect(passwords.verifyDummy).toHaveBeenCalledWith('x');
    });

    it('returns the same 401 for a wrong password', async () => {
      const { service, passwords } = setup();
      passwords.verify.mockResolvedValue(false);
      await expect(service.validateCredentials('user@example.com', 'wrong')).rejects.toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    });

    it('checks status only after the password: inactive + wrong password → 401', async () => {
      const { service, users, passwords } = setup();
      users.findByEmailWithCredentials.mockResolvedValue({ ...user, status: UserStatus.SUSPENDED, passwordHash: 'h' });
      passwords.verify.mockResolvedValue(false);
      await expect(service.validateCredentials('user@example.com', 'wrong')).rejects.toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
      });
    });

    it('inactive + correct password → 403 with the status in details', async () => {
      const { service, users } = setup();
      users.findByEmailWithCredentials.mockResolvedValue({ ...user, status: UserStatus.SUSPENDED, passwordHash: 'h' });
      await expect(service.validateCredentials('user@example.com', 'right')).rejects.toMatchObject({
        code: 'AUTH_ACCOUNT_NOT_ACTIVE',
        details: { status: 'SUSPENDED' },
      });
    });
  });

  describe('login (FR-LOGIN-06..08)', () => {
    it('creates a session storing only the refresh-token hash and returns the token pair', async () => {
      const { service, sessions, users, tokens } = setup();
      const result = await service.login({ email: 'user@example.com', password: 'right' }, ctx);

      const [sessionInput] = sessions.create.mock.calls[0];
      expect(sessionInput).toMatchObject({
        userId: 'u1',
        refreshTokenHash: 'sha256(refresh.jwt)',
        expiresAt: new Date('2026-02-01T00:00:00Z'),
        ipAddress: '203.0.113.7',
        userAgent: 'test-agent',
      });
      expect(JSON.stringify(sessionInput)).not.toContain('"refresh.jwt"');
      // Both tokens are bound to the same new session id.
      expect(tokens.signAccessToken).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), sessionInput.id);
      expect(tokens.signRefreshToken).toHaveBeenCalledWith('u1', sessionInput.id);
      expect(users.updateLastLoginAt).toHaveBeenCalledWith('u1', expect.any(Date));
      expect(result).toMatchObject({
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: 'u1', email: 'user@example.com' },
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.lastLoginAt).not.toBeNull();
    });

    it('FR-S-05: re-hashes when parameters are outdated', async () => {
      const { service, passwords, users } = setup();
      passwords.needsRehash.mockReturnValue(true);
      await service.login({ email: 'user@example.com', password: 'right' }, ctx);
      expect(passwords.hash).toHaveBeenCalledWith('right');
      expect(users.updatePasswordHash).toHaveBeenCalledWith('u1', 'hashed');
    });

    it('gives every login its own session id', async () => {
      const { service, sessions } = setup();
      await service.login({ email: 'user@example.com', password: 'right' }, ctx);
      await service.login({ email: 'user@example.com', password: 'right' }, ctx);
      expect(sessions.create.mock.calls[0][0].id).not.toBe(sessions.create.mock.calls[1][0].id);
    });
  });

  it('SessionRevokedReason covers every documented reason', () => {
    expect(Object.values(SessionRevokedReason)).toEqual([
      'LOGOUT', 'LOGOUT_ALL', 'LOGOUT_OTHERS', 'REUSE_DETECTED', 'USER_NOT_ACTIVE', 'ADMIN_REVOKED',
    ]);
  });
});
