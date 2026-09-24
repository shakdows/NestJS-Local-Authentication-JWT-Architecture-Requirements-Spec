import { Module } from '@nestjs/common';
import { RolesService } from './roles.service.js';

@Module({
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
