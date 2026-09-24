import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwtConfig from '../../../config/jwt.config.js';
import { JWT_REFRESH_STRATEGY } from '../auth.constants.js';
import type { RefreshTokenPayload } from '../interfaces/jwt-payload.interface.js';
import { SessionsService } from '../sessions/sessions.service.js';
import type { RefreshContext } from '../types/refresh-context.type.js';

/**
 * Refresh-token validation (JWT_SPEC §4.4). passport-jwt verifies the signature with the
 * refresh secret; session checks and reuse detection are delegated to SessionsService.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  JWT_REFRESH_STRATEGY,
) {
  constructor(
    @Inject(jwtConfig.KEY) config: ConfigType<typeof jwtConfig>,
    private readonly sessionsService: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: config.refresh.secret,
      algorithms: ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
      ignoreExpiration: false,
      passReqToCallback: true,
      jsonWebTokenOptions: { clockTolerance: 5 },
    });
  }

  validate(
    req: Request,
    payload: RefreshTokenPayload,
  ): Promise<RefreshContext> {
    const rawToken = (req.body as { refreshToken: string }).refreshToken;
    return this.sessionsService.validateForRefresh(payload, rawToken);
  }
}
