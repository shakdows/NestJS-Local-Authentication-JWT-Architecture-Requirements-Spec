import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ClientContext as ClientContextType } from '../types/client-context.type.js';

export const MAX_USER_AGENT_LENGTH = 512;
export const MAX_IP_LENGTH = 45;

export function extractClientContext(request: Request): ClientContextType {
  const ip = request.ip ?? null;
  const userAgent = request.get('user-agent') ?? null;
  return {
    ipAddress: ip ? ip.slice(0, MAX_IP_LENGTH) : null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}

/** Injects `{ ipAddress, userAgent }` for the current request. `req.ip` honours `TRUST_PROXY`. */
export const ClientContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientContextType =>
    extractClientContext(ctx.switchToHttp().getRequest<Request>()),
);
