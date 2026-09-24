import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { uuidParam } from '../../../common/pipes/uuid-param.pipe.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';
import { UserSessionsService } from './user-sessions.service.js';

/** The caller's own sessions / devices (AUTH_API §3.7–3.9). */
@Controller('auth/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly userSessions: UserSessionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.userSessions.listOwn(user);
  }

  @Post('revoke-others')
  @HttpCode(HttpStatus.OK)
  revokeOthers(@CurrentUser() user: AuthenticatedUser) {
    return this.userSessions.revokeOthers(user);
  }

  @Delete(':id')
  revokeOne(@CurrentUser() user: AuthenticatedUser, @Param('id', uuidParam()) id: string) {
    return this.userSessions.revokeOwn(user, id);
  }
}
