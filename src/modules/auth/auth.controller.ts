import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientContext } from '../../common/decorators/client-context.decorator.js';
import type { ClientContext as ClientContextType } from '../../common/types/client-context.type.js';
import { AUTH_THROTTLE } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard.js';
import type { AuthenticatedUser } from './types/authenticated-user.type.js';
import type { RefreshContext } from './types/refresh-context.type.js';

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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_THROTTLE.login })
  login(@Body() dto: LoginDto, @ClientContext() ctx: ClientContextType) {
    return this.authService.login(dto, ctx);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_THROTTLE.refresh })
  @UseGuards(JwtRefreshGuard)
  refresh(
    @Body() _dto: RefreshTokenDto,
    @CurrentUser() refresh: RefreshContext,
  ) {
    return this.authService.refreshTokens(refresh);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logoutAll(user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }
}
