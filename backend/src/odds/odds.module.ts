import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { OddsSnapshot } from '../database/entities/odds-snapshot.entity';
import { ProviderApiFootballModule } from '../provider-api-football/provider-api-football.module';
import { OddsController } from './odds.controller';
import { OddsIngestionService } from './odds-ingestion.service';
import { OddsService } from './odds.service';
import { OddsSyncScheduler } from './odds-sync.scheduler';
import { ExecutableQuoteService } from './executable-quote.service';

@Global()
@Module({
  imports: [
    ProviderApiFootballModule,
    TypeOrmModule.forFeature([ApiUsageLog, Fixture, OddsSnapshot]),
  ],
  controllers: [OddsController],
  providers: [
    OddsIngestionService,
    OddsSyncScheduler,
    OddsService,
    ExecutableQuoteService,
  ],
  exports: [OddsIngestionService, ExecutableQuoteService],
})
export class OddsModule {}
