import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiFootballPayload, Fixture])],
  providers: [CleanupService],
})
export class MaintenanceModule {}
