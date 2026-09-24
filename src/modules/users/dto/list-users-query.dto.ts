import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Role } from '../../roles/role.enum.js';
import { UserStatus } from '../enums/user-status.enum.js';

/** GET /users query (AUTH_API §3.10). */
export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must be at most 100' })
  limit: number = 20;

  @IsOptional()
  @IsEnum(UserStatus, { message: `status must be one of: ${Object.values(UserStatus).join(', ')}` })
  status?: UserStatus;

  @IsOptional()
  @IsEnum(Role, { message: `role must be one of: ${Object.values(Role).join(', ')}` })
  role?: Role;

  @IsOptional()
  @IsString({ message: 'search must be a string' })
  @MaxLength(254, { message: 'search must be at most 254 characters' })
  search?: string;
}
