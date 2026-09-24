import type { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class RegisterResponseDto {
  user: UserResponseDto;
}

/** Token fields shared by login and refresh (AUTH_API §2.5). */
export class TokensResponseDto {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

export class LoginResponseDto extends TokensResponseDto {
  user: UserResponseDto;
}

export class ProfileResponseDto {
  user: UserResponseDto;
}
