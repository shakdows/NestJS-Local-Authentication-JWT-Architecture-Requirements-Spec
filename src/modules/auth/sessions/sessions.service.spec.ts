import { Role } from '../../roles/role.enum.js';
import { UserStatus } from '../../users/enums/user-status.enum.js';
import type { UsersService } from '../../users/users.service.js';
import type { TokenService } from '../services/token.service.js';
import { SessionRevokedReason } from './enums/session-revoked-reason.enum.js';
import type { SessionsRepository } from './sessions.repository.js';
import { SessionsService } from './sessions.service.js';

const SID = '3b0e7a52-6f2d-4a8c-b1e4-9c7d5f0a1e23';
const UID = '8f1c2e5a-0b7d-4c1e-9a55-2d3f1b6c7e90';
const payload = { sub: UID, sid: SID, jti: 'j', type: 'refresh' as const };

function setup() {
  const session = {
    id: SID,
    userId: UID,
    refreshTokenHash: 'current-hash',
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000),
  };
  const repo = {
    findWithHash: vi.fn().mockResolvedValue(session),
    revoke: vi.fn().mockResolvedValue(1),
    findActiveIdentity: vi.fn(),
  };
  const users = {
    findById: vi.fn().mockResolvedValue({
      id: UID,
      status: UserStatus.ACTIVE,
      roles: [Role.USER],
    }),
  };
  const tokens = { compareRefreshTokenHash: vi.fn().mockReturnValue(true) };
  const service = new SessionsService(
    repo as unknown as SessionsRepository,
    users as unknown as UsersService,
    tokens as unknown as TokenService,
  );
  vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  return { service, repo, users, tokens, session };
}

describe('SessionsService.validateForRefresh (JWT_SPEC §4.4)', () => {
  it('returns the refresh context for a current, usable session', async () => {
    const { service } = setup();
    await expect(service.validateForRefresh(payload, 'raw')).resolves.toEqual({
      userId: UID,
      sessionId: SID,
      refreshToken: 'raw',
    });
  });

  it.each([
    ['wrong type', { ...payload, type: 'access' as unknown as 'refresh' }],
    ['non-uuid sid', { ...payload, sid: 'x' }],
    ['non-uuid sub', { ...payload, sub: 'x' }],
  ])('rejects %s without touching the database', async (_label, bad) => {
    const { service, repo } = setup();
    await expect(service.validateForRefresh(bad, 'raw')).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
    expect(repo.findWithHash).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown session', (s: Record<string, unknown>) => s, true],
    [
      'revoked session',
      (s: Record<string, unknown>) => ({ ...s, revokedAt: new Date() }),
      false,
    ],
    [
      'expired session',
      (s: Record<string, unknown>) => ({
        ...s,
        expiresAt: new Date(Date.now() - 1),
      }),
      false,
    ],
    [
      'user mismatch',
      (s: Record<string, unknown>) => ({ ...s, userId: 'someone-else' }),
      false,
    ],
  ])('rejects a %s with the generic 401', async (_label, mutate, missing) => {
    const { service, repo, session } = setup();
    repo.findWithHash.mockResolvedValue(missing ? null : mutate(session));
    await expect(
      service.validateForRefresh(payload, 'raw'),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_INVALID' });
    expect(repo.revoke).not.toHaveBeenCalled();
  });

  it('FR-REFRESH-05: hash mismatch ⇒ reuse ⇒ session revoked with REUSE_DETECTED, logged without token', async () => {
    const { service, repo, tokens } = setup();
    tokens.compareRefreshTokenHash.mockReturnValue(false);
    const warn = service['logger'].warn as unknown as ReturnType<typeof vi.fn>;
    await expect(
      service.validateForRefresh(payload, 'stolen.old.token'),
    ).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
    expect(repo.revoke).toHaveBeenCalledWith(
      SID,
      SessionRevokedReason.REUSE_DETECTED,
    );
    expect(warn).toHaveBeenCalledWith({
      event: 'auth.refresh.reuse_detected',
      userId: UID,
      sessionId: SID,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('stolen.old.token');
  });

  it('non-active user ⇒ session revoked with USER_NOT_ACTIVE and 403', async () => {
    const { service, repo, users } = setup();
    users.findById.mockResolvedValue({ id: UID, status: UserStatus.SUSPENDED });
    await expect(
      service.validateForRefresh(payload, 'raw'),
    ).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_NOT_ACTIVE' });
    expect(repo.revoke).toHaveBeenCalledWith(
      SID,
      SessionRevokedReason.USER_NOT_ACTIVE,
    );
  });
});

describe('SessionsService.findActiveSessionForAccess', () => {
  it('returns null for malformed ids without querying', async () => {
    const { service, repo } = setup();
    await expect(
      service.findActiveSessionForAccess('bad', UID),
    ).resolves.toBeNull();
    expect(repo.findActiveIdentity).not.toHaveBeenCalled();
  });
});
