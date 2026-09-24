import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Injects `request.user` (an `AuthenticatedUser` after JwtAuthGuard, a `RefreshContext`
 * after JwtRefreshGuard), or one of its properties: `@CurrentUser('id')`.
 */
export const CurrentUser = createParamDecorator((key: string | undefined, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<Request & { user?: Record<string, unknown> }>().user;
  return key ? user?.[key] : user;
});
