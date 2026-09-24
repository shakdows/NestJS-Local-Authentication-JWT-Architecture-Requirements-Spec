import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';

/** Thin HTTP layer: bind DTO → one service call → return (NFR-03). */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: AUTH_THROTTLE.register })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
