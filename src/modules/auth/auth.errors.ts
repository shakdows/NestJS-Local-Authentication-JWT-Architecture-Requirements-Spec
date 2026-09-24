import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';

/** Factories for auth errors so status, code and message never drift (AUTH_ARCHITECTURE §9). */
export const AuthErrors = {
  invalidCredentials: () =>
    new AppException(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_INVALID_CREDENTIALS,
    ),
  emailAlreadyExists: () =>
    new AppException(HttpStatus.CONFLICT, ErrorCode.AUTH_EMAIL_ALREADY_EXISTS),
  /** `details.status` is only exposed on login, after the password was verified (AUTH_API §2.4). */
  accountNotActive: (status?: string) =>
    new AppException(
      HttpStatus.FORBIDDEN,
      ErrorCode.AUTH_ACCOUNT_NOT_ACTIVE,
      undefined,
      status ? { status } : null,
    ),
  tokenMissing: () =>
    new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_MISSING),
  tokenInvalid: () =>
    new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_INVALID),
  tokenExpired: () =>
    new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_EXPIRED),
  refreshTokenInvalid: () =>
    new AppException(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    ),
  forbidden: () =>
    new AppException(HttpStatus.FORBIDDEN, ErrorCode.AUTH_FORBIDDEN),
  notFound: () =>
    new AppException(HttpStatus.NOT_FOUND, ErrorCode.RESOURCE_NOT_FOUND),
};
