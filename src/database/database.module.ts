import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '../config/database.config.js';
import { buildDataSourceOptions } from './database.options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule.forFeature(databaseConfig)],
      inject: [databaseConfig.KEY],
      useFactory: (db: ConfigType<typeof databaseConfig>) =>
        buildDataSourceOptions(db),
    }),
  ],
})
export class DatabaseModule {}
