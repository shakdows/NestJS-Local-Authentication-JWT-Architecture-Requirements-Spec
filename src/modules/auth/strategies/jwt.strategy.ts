import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwtConfig from '../../../config/jwt.config.js';
import { UserStatus } from '../../users/enums/user-status.enum.js';
import { JWT_STRATEGY } from '../auth.constants.js';
import { AuthErrors } from '../auth.errors.js';
import type { AccessTokenPayload } from '../interfaces/jwt-payload.interface.js';
import { SessionsService } from '../sessions/sessions.service.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';

/**
 * Access-token validation (JWT_SPEC §3.4): signature/alg/exp/iss/aud by passport-jwt,
 * then token type, session and account status against the database.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY) {
  constructor(
    @Inject(jwtConfig.KEY) config: ConfigType<typeof jwtConfig>,
    private readonly sessionsService: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.access.secret,
      algorithms: ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
      ignoreExpiration: false,
      jsonWebTokenOptions: { clockTolerance: 5 },
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (
      payload.type !== 'access' ||
      typeof payload.sid !== 'string' ||
      typeof payload.sub !== 'string'
    ) {
      throw AuthErrors.tokenInvalid();
    }
    const identity = await this.sessionsService.findActiveSessionForAccess(
      payload.sid,
      payload.sub,
    );
    if (!identity) throw AuthErrors.tokenInvalid();
    if (identity.status !== UserStatus.ACTIVE)
      throw AuthErrors.accountNotActive();
    return {
      id: identity.userId,
      email: identity.email,
      roles: identity.roles,
      status: identity.status,
      sessionId: identity.sessionId,
    };
  }
}
