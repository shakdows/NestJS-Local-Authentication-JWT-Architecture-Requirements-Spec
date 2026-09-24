import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';

export interface SuccessEnvelope<T> {
  success: true;
  data: T | null;
}

/**
 * Wraps controller return values in `{ success: true, data }` (AUTH_API §2.1).
 * Also sets `Cache-Control: no-store` on every API response (SEC-HTTP-06 applies it to
 * `/auth/*`; applying it everywhere is a safe superset for a JSON API).
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<T>> {
    if (context.getType() === 'http') {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Cache-Control', 'no-store');
    }
    return next
      .handle()
      .pipe(map((data) => ({ success: true as const, data: data ?? null })));
  }
}
