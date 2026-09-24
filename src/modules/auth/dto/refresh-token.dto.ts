import { IsJWT, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { REFRESH_TOKEN_MAX_LENGTH } from '../auth.constants.js';

/**
 * POST /auth/refresh body (AUTH_API §3.3). JwtRefreshGuard runs before this DTO is validated,
 * so a missing/invalid token is a 401; the DTO still rejects extra fields.
 */
export class RefreshTokenDto {
  @IsNotEmpty({ message: 'refreshToken is required' })
  @IsString({ message: 'refreshToken must be a string' })
  @MaxLength(REFRESH_TOKEN_MAX_LENGTH, { message: 'refreshToken is too long' })
  @IsJWT({ message: 'refreshToken must be a JWT' })
  refreshToken: string;
}
