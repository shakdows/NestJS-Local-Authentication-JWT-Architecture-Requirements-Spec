import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { uuidParam } from '../../common/pipes/uuid-param.pipe.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../roles/role.enum.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UsersAdminService } from './users-admin.service.js';

/**
 * ADMIN user management (FR-ADMIN). Guards/decorators are imported as the auth module's public
 * API; this creates no DI dependency on AuthModule (AUTH_ARCHITECTURE §4 rule 4).
 */
@Controller('users')
@Auth(Role.ADMIN)
export class UsersController {
  constructor(private readonly usersAdmin: UsersAdminService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.usersAdmin.list(query);
  }

  @Get('stats')
  stats() {
    return this.usersAdmin.stats();
  }

  @Get(':id')
  get(@Param('id', uuidParam()) id: string) {
    return this.usersAdmin.get(id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser('id') actorId: string,
    @Param('id', uuidParam()) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersAdmin.updateStatus(actorId, id, dto.status);
  }

  @Patch(':id/roles')
  updateRoles(
    @CurrentUser('id') actorId: string,
    @Param('id', uuidParam()) id: string,
    @Body() dto: UpdateUserRolesDto,
  ) {
    return this.usersAdmin.updateRoles(actorId, id, dto.roles);
  }
}
