import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '../../../common/constants/error-codes.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { JWT_REFRESH_STRATEGY } from '../auth.constants.js';
import { AuthErrors } from '../auth.errors.js';

/** Every refresh failure is the same generic 401, except a non-active account (FR-REFRESH-06). */
export function mapRefreshTokenFailure(err: unknown): AppException {
  if (err instanceof AppException && err.code === ErrorCode.AUTH_ACCOUNT_NOT_ACTIVE) return err;
  return AuthErrors.refreshTokenInvalid();
}

/** Validates refresh-token requests (POST /auth/refresh only). */
@Injectable()
export class JwtRefreshGuard extends AuthGuard(JWT_REFRESH_STRATEGY) {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) throw mapRefreshTokenFailure(err);
    return user;
  }
}
