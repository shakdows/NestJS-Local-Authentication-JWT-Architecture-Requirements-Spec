import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig from '../../config/auth.config.js';
import jwtConfig from '../../config/jwt.config.js';
import { RolesModule } from '../roles/roles.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';
import { AuthSessionEntity } from './sessions/entities/auth-session.entity.js';
import { SessionsRepository } from './sessions/sessions.repository.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AdminSessionsController } from './sessions/admin-sessions.controller.js';
import { SessionsController } from './sessions/sessions.controller.js';
import { SessionsService } from './sessions/sessions.service.js';
import { UserSessionsService } from './sessions/user-sessions.service.js';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(jwtConfig),
    PassportModule,
    // No default secret: every sign/verify passes its own (SEC-JWT-05).
    JwtModule.register({}),
    TypeOrmModule.forFeature([AuthSessionEntity]),
    UsersModule,
    RolesModule,
  ],
  controllers: [AuthController, SessionsController, AdminSessionsController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    SessionsRepository,
    SessionsService,
    UserSessionsService,
    JwtStrategy,
    JwtRefreshStrategy,
    RolesGuard,
  ],
  exports: [SessionsService, RolesGuard],
})
export class AuthModule {}
