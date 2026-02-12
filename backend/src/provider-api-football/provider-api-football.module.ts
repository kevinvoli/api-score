import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { ApiFootballClient } from './services/api-football.client';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([ApiUsageLog])],
  providers: [ApiFootballClient],
  exports: [ApiFootballClient],
})
export class ProviderApiFootballModule {}
