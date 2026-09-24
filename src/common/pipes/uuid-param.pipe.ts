import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes.js';
import { AppException } from '../exceptions/app.exception.js';

/** `ParseUUIDPipe` that reports failures as `400 VALIDATION_FAILED` (SEC-VAL-04, AUTH_API §2.2). */
export function uuidParam(field = 'id'): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () =>
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        undefined,
        [{ field, messages: [`${field} must be a UUID`] }],
      ),
  });
}
