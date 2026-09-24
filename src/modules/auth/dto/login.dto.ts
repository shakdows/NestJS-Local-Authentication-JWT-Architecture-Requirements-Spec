import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../auth.constants.js';
import { NormalizeEmail } from './email.transform.js';

/** POST /auth/login body (AUTH_API §3.2). No password policy here (FR-PWD-04). */
export class LoginDto {
  @NormalizeEmail()
  @IsNotEmpty({ message: 'email is required' })
  @IsString({ message: 'email must be a string' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(EMAIL_MAX_LENGTH, { message: 'email must be at most 254 characters' })
  email: string;

  @IsNotEmpty({ message: 'password is required' })
  @IsString({ message: 'password must be a string' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'password must be at most 128 characters' })
  password: string;
}
