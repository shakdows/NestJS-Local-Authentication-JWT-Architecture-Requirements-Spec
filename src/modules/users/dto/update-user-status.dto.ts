import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from '../enums/user-status.enum.js';

/** PATCH /users/:id/status body (AUTH_API §3.13). */
export class UpdateUserStatusDto {
  @IsNotEmpty({ message: 'status is required' })
  @IsEnum(UserStatus, {
    message: `status must be one of: ${Object.values(UserStatus).join(', ')}`,
  })
  status: UserStatus;
}
