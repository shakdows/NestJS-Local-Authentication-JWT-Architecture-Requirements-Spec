/** Stable machine-readable error codes (AUTH_API §2.4). Clients switch on these, never on messages. */
export enum ErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  BAD_REQUEST = 'BAD_REQUEST',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_REFRESH_TOKEN_INVALID = 'AUTH_REFRESH_TOKEN_INVALID',
  AUTH_ACCOUNT_NOT_ACTIVE = 'AUTH_ACCOUNT_NOT_ACTIVE',
  AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',
  USER_SELF_MODIFICATION_FORBIDDEN = 'USER_SELF_MODIFICATION_FORBIDDEN',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  AUTH_EMAIL_ALREADY_EXISTS = 'AUTH_EMAIL_ALREADY_EXISTS',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_FAILED]: 'Request validation failed',
  [ErrorCode.BAD_REQUEST]: 'Bad request',
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid email or password',
  [ErrorCode.AUTH_TOKEN_MISSING]: 'Authentication required',
  [ErrorCode.AUTH_TOKEN_INVALID]: 'Invalid or revoked access token',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Access token expired',
  [ErrorCode.AUTH_REFRESH_TOKEN_INVALID]: 'Invalid refresh token',
  [ErrorCode.AUTH_ACCOUNT_NOT_ACTIVE]: 'Account is not active',
  [ErrorCode.AUTH_FORBIDDEN]: 'Insufficient permissions',
  [ErrorCode.USER_SELF_MODIFICATION_FORBIDDEN]:
    'You cannot change your own status or remove your own admin role',
  [ErrorCode.RESOURCE_NOT_FOUND]: 'Resource not found',
  [ErrorCode.AUTH_EMAIL_ALREADY_EXISTS]: 'Email is already registered',
  [ErrorCode.PAYLOAD_TOO_LARGE]: 'Payload too large',
  [ErrorCode.RATE_LIMITED]: 'Too many requests, please try again later',
  [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
};
