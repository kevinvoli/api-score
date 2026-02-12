import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiUsageLog])],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}
