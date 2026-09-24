import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_MESSAGES, ErrorCode } from '../constants/error-codes.js';

/** Domain error carrying a stable {@link ErrorCode}. Rendered by `AllExceptionsFilter`. */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: HttpStatus, code: ErrorCode, message?: string, details: unknown = null) {
    const text = message ?? ERROR_MESSAGES[code];
    super(text, status);
    this.code = code;
    this.details = details;
  }
}
