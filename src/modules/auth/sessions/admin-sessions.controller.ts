import { Controller, Delete, Get, Param } from '@nestjs/common';
import { uuidParam } from '../../../common/pipes/uuid-param.pipe.js';
import { Role } from '../../roles/role.enum.js';
import { Auth } from '../decorators/auth.decorator.js';
import { UserSessionsService } from './user-sessions.service.js';

/**
 * ADMIN: a user's sessions (FR-ADMIN-07). Lives in AuthModule because sessions are an auth
 * concern; this keeps UsersModule free of any dependency on AuthModule.
 */
@Controller('users/:id/sessions')
@Auth(Role.ADMIN)
export class AdminSessionsController {
  constructor(private readonly userSessions: UserSessionsService) {}

  @Get()
  list(@Param('id', uuidParam()) userId: string) {
    return this.userSessions.listForUser(userId);
  }

  @Delete()
  revokeAll(@Param('id', uuidParam()) userId: string) {
    return this.userSessions.revokeAllForUser(userId);
  }
}
