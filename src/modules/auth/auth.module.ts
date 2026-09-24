import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import authConfig from '../../config/auth.config.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './services/password.service.js';

@Module({
  imports: [ConfigModule.forFeature(authConfig), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
})
export class AuthModule {}
