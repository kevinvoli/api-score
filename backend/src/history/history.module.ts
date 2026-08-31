import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { ProviderApiFootballModule } from '../provider-api-football/provider-api-football.module';
import { HistoryImportService } from './history-import.service';

@Module({
  imports: [
    ProviderApiFootballModule,
    TypeOrmModule.forFeature([Fixture, FixtureStatsSnapshot, FixtureEvent]),
  ],
  providers: [HistoryImportService],
  exports: [HistoryImportService],
})
export class HistoryModule {}
