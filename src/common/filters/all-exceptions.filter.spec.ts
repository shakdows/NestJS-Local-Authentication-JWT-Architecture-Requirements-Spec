import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ErrorCode } from '../constants/error-codes.js';
import { AppException } from '../exceptions/app.exception.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function createHost() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
  const request = { path: '/auth/login' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter (FR-ERR)', () => {
  const filter = new AllExceptionsFilter();

  it('renders AppException with its code, message and details', () => {
    const { host, response } = createHost();
    filter.catch(
      new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, undefined, [
        { field: 'email', messages: ['x'] },
      ]),
      host,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body).toMatchObject({
      success: false,
      error: {
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: [{ field: 'email', messages: ['x'] }],
        path: '/auth/login',
      },
    });
    expect(typeof body.error.timestamp).toBe('string');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('maps Nest HttpExceptions by status', () => {
    const { host, response } = createHost();
    filter.catch(new NotFoundException('Cannot GET /x'), host);
    expect(response.json.mock.calls[0][0].error).toMatchObject({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('maps throttler errors to RATE_LIMITED', () => {
    const { host, response } = createHost();
    filter.catch(new ThrottlerException(), host);
    expect(response.json.mock.calls[0][0].error.code).toBe('RATE_LIMITED');
  });

  it('maps body-parser style errors carrying a status', () => {
    const { host, response } = createHost();
    filter.catch(Object.assign(new Error('too large'), { status: 413 }), host);
    expect(response.json.mock.calls[0][0].error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('hides unknown errors behind a generic 500 without stack or message', () => {
    const { host, response } = createHost();
    const logSpy = vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    filter.catch(new Error('relation "users" does not exist'), host);
    const body = response.json.mock.calls[0][0];
    expect(response.status).toHaveBeenCalledWith(500);
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(logSpy).toHaveBeenCalled();
  });
});
