import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_MESSAGES, ErrorCode } from '../constants/error-codes.js';
import { AppException } from '../exceptions/app.exception.js';

interface ResolvedError {
  status: number;
  code: ErrorCode;
  message: string;
  details: unknown;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.AUTH_TOKEN_INVALID,
  [HttpStatus.FORBIDDEN]: ErrorCode.AUTH_FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.RESOURCE_NOT_FOUND,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

function fromStatus(status: number): ResolvedError {
  const code =
    STATUS_TO_CODE[status] ??
    (status < 500 ? ErrorCode.BAD_REQUEST : ErrorCode.INTERNAL_ERROR);
  return { status, code, message: ERROR_MESSAGES[code], details: null };
}

/**
 * Renders every error as the AUTH_API §2.2 envelope. Never includes stack traces,
 * SQL or request bodies. Unknown errors are logged with their stack and returned as 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const resolved = this.resolve(exception);

    response.setHeader('Cache-Control', 'no-store');
    response.status(resolved.status).json({
      success: false,
      error: {
        statusCode: resolved.status,
        code: resolved.code,
        message: resolved.message,
        details: resolved.details,
        timestamp: new Date().toISOString(),
        path: request.path,
      },
    });
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      return fromStatus(exception.getStatus());
    }
    // Errors raised by Express middleware (e.g. body-parser) carry a numeric status.
    const status = (exception as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return fromStatus(status);
    }
    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`Unhandled error: ${error.message}`, error.stack);
    return fromStatus(HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
