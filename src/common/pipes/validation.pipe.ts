import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes.js';
import { AppException } from '../exceptions/app.exception.js';

export interface ValidationDetail {
  field: string;
  messages: string[];
}

/** Flattens nested class-validator errors into `{ field: 'a.b', messages }` entries. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/** Global validation pipe (SEC-VAL-01, SEC-VAL-06): strips/forbids unknown fields, never echoes values. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        undefined,
        flattenValidationErrors(errors),
      ),
  });
}
