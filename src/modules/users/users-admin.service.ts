import { Injectable } from '@nestjs/common';
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import type { UserResponseDto } from './dto/user-response.dto.js';
import type { UserStatus } from './enums/user-status.enum.js';
import { toUserResponse } from './mappers/user.mapper.js';
import type { Role } from '../roles/role.enum.js';
import type { UserStats } from './types/user.types.js';
import { UsersService } from './users.service.js';

export interface PaginatedUsers {
  items: UserResponseDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Admin use cases (FR-ADMIN): maps domain users to API responses for UsersController. */
@Injectable()
export class UsersAdminService {
  constructor(private readonly usersService: UsersService) {}

  async list(query: ListUsersQueryDto): Promise<PaginatedUsers> {
    const { items, total } = await this.usersService.list(query);
    return {
      items: items.map(toUserResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  stats(): Promise<UserStats> {
    return this.usersService.getStats();
  }

  async get(id: string): Promise<{ user: UserResponseDto }> {
    return { user: toUserResponse(await this.usersService.getByIdOrFail(id)) };
  }

  async updateStatus(
    actorId: string,
    id: string,
    status: UserStatus,
  ): Promise<{ user: UserResponseDto }> {
    return {
      user: toUserResponse(
        await this.usersService.updateStatus(actorId, id, status),
      ),
    };
  }

  async updateRoles(
    actorId: string,
    id: string,
    roles: Role[],
  ): Promise<{ user: UserResponseDto }> {
    return {
      user: toUserResponse(
        await this.usersService.setRoles(actorId, id, roles),
      ),
    };
  }
}
