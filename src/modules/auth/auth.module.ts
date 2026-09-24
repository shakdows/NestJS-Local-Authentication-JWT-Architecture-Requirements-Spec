import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import authConfig from '../../config/auth.config.js';
import { PasswordService } from './services/password.service.js';

@Module({
  imports: [ConfigModule.forFeature(authConfig)],
  providers: [PasswordService],
})
export class AuthModule {}
