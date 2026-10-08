import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../config/env';
import { baseDatabaseOptions } from './database.options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        ...baseDatabaseOptions(config.get('DATABASE_URL', { infer: true })),
        // Each module registers its own entities with TypeOrmModule.forFeature().
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
