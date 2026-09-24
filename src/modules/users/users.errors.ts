import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';

/** Factories for user-domain errors so status, code and message never drift. */
export const UsersErrors = {
  emailAlreadyExists: () =>
    new AppException(HttpStatus.CONFLICT, ErrorCode.AUTH_EMAIL_ALREADY_EXISTS),
  notFound: () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.RESOURCE_NOT_FOUND),
  selfModificationForbidden: () =>
    new AppException(HttpStatus.FORBIDDEN, ErrorCode.USER_SELF_MODIFICATION_FORBIDDEN),
};
