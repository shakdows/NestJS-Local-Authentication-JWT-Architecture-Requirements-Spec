import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_LETTER_AND_DIGIT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../auth.constants.js';
import { NotEqualToEmail } from '../validators/not-equal-to-email.validator.js';
import { NormalizeEmail } from './email.transform.js';

/** POST /auth/register body (AUTH_API §3.1). Unknown fields such as `roles` are rejected. */
export class RegisterDto {
  @NormalizeEmail()
  @IsNotEmpty({ message: 'email is required' })
  @IsString({ message: 'email must be a string' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(EMAIL_MAX_LENGTH, {
    message: 'email must be at most 254 characters',
  })
  email: string;

  @IsNotEmpty({ message: 'password is required' })
  @IsString({ message: 'password must be a string' })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: 'password must be at least 8 characters',
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: 'password must be at most 128 characters',
  })
  @Matches(PASSWORD_LETTER_AND_DIGIT, {
    message: 'password must contain at least one letter and one digit',
  })
  @NotEqualToEmail()
  password: string;
}
