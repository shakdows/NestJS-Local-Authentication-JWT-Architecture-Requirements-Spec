import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

function context(setHeader = vi.fn()) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;
}

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('wraps data in the success envelope and disables caching', async () => {
    const setHeader = vi.fn();
    const handler: CallHandler = { handle: () => of({ user: { id: '1' } }) };
    await expect(
      lastValueFrom(interceptor.intercept(context(setHeader), handler)),
    ).resolves.toEqual({
      success: true,
      data: { user: { id: '1' } },
    });
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('uses null when the handler returns nothing', async () => {
    const handler: CallHandler = { handle: () => of(undefined) };
    await expect(
      lastValueFrom(interceptor.intercept(context(), handler)),
    ).resolves.toEqual({
      success: true,
      data: null,
    });
  });
});
