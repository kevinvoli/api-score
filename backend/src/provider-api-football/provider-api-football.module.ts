import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { ApiFootballClient } from './services/api-football.client';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([ApiUsageLog, ApiFootballPayload])],
  providers: [ApiFootballClient],
  exports: [ApiFootballClient],
})
export class ProviderApiFootballModule {}
