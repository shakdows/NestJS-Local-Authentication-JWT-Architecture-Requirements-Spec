import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { JWT_STRATEGY } from '../auth.constants.js';
import { AuthErrors } from '../auth.errors.js';

/** Maps passport-jwt failures to stable codes: missing / expired / invalid (FR-GUARD-03). */
export function mapAccessTokenFailure(
  err: unknown,
  info: unknown,
): AppException {
  if (err instanceof AppException) return err;
  const failure = info as { name?: string; message?: string } | undefined;
  if (failure?.name === 'TokenExpiredError') return AuthErrors.tokenExpired();
  if (failure?.message === 'No auth token') return AuthErrors.tokenMissing();
  return AuthErrors.tokenInvalid();
}

/** Protects routes that require a valid access token. Populates `request.user`. */
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY) {
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) throw mapAccessTokenFailure(err, info);
    return user;
  }
}
