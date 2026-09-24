import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-codes.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { JwtAuthGuard, mapAccessTokenFailure } from './jwt-auth.guard.js';
import { JwtRefreshGuard, mapRefreshTokenFailure } from './jwt-refresh.guard.js';

describe('JwtAuthGuard failure mapping (FR-GUARD-03)', () => {
  it.each([
    ['expired', undefined, { name: 'TokenExpiredError', message: 'jwt expired' }, 'AUTH_TOKEN_EXPIRED'],
    ['missing', undefined, { name: 'Error', message: 'No auth token' }, 'AUTH_TOKEN_MISSING'],
    ['bad signature', undefined, { name: 'JsonWebTokenError', message: 'invalid signature' }, 'AUTH_TOKEN_INVALID'],
    ['alg none', undefined, { name: 'JsonWebTokenError', message: 'jwt signature is required' }, 'AUTH_TOKEN_INVALID'],
    ['no info', undefined, undefined, 'AUTH_TOKEN_INVALID'],
    ['generic error', new Error('boom'), undefined, 'AUTH_TOKEN_INVALID'],
  ])('%s → %s', (_label, err, info, code) => {
    expect(mapAccessTokenFailure(err, info).code).toBe(code);
  });

  it('passes AppExceptions from the strategy through unchanged', () => {
    const notActive = new AppException(HttpStatus.FORBIDDEN, ErrorCode.AUTH_ACCOUNT_NOT_ACTIVE);
    expect(mapAccessTokenFailure(notActive, undefined)).toBe(notActive);
  });

  it('handleRequest returns the user on success and throws otherwise', () => {
    const guard = new JwtAuthGuard();
    expect(guard.handleRequest(null, { id: 'u1' }, undefined)).toEqual({ id: 'u1' });
    expect(() => guard.handleRequest(null, false, { name: 'TokenExpiredError' })).toThrow('Access token expired');
  });
});

describe('JwtRefreshGuard failure mapping (FR-REFRESH-06)', () => {
  it('maps every failure to AUTH_REFRESH_TOKEN_INVALID', () => {
    expect(mapRefreshTokenFailure(new Error('jwt expired')).code).toBe('AUTH_REFRESH_TOKEN_INVALID');
    expect(mapRefreshTokenFailure(undefined).code).toBe('AUTH_REFRESH_TOKEN_INVALID');
    const tokenInvalid = new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_INVALID);
    expect(mapRefreshTokenFailure(tokenInvalid).code).toBe('AUTH_REFRESH_TOKEN_INVALID');
  });

  it('keeps AUTH_ACCOUNT_NOT_ACTIVE', () => {
    const notActive = new AppException(HttpStatus.FORBIDDEN, ErrorCode.AUTH_ACCOUNT_NOT_ACTIVE);
    expect(mapRefreshTokenFailure(notActive)).toBe(notActive);
  });

  it('handleRequest throws the generic refresh error', () => {
    expect(() => new JwtRefreshGuard().handleRequest(null, false)).toThrow('Invalid refresh token');
  });
});
