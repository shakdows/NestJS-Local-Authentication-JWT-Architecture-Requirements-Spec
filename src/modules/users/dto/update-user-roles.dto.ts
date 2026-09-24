import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { Role } from '../../roles/role.enum.js';

/** PATCH /users/:id/roles body (AUTH_API §3.14). USER is always kept by the service. */
export class UpdateUserRolesDto {
  @IsArray({ message: 'roles must be an array' })
  @ArrayMinSize(1, { message: 'roles must contain at least 1 role' })
  @ArrayMaxSize(10, { message: 'roles must contain at most 10 roles' })
  @ArrayUnique({ message: 'roles must be unique' })
  @IsEnum(Role, { each: true, message: `each role must be one of: ${Object.values(Role).join(', ')}` })
  roles: Role[];
}
