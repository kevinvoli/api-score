import { Module } from '@nestjs/common';
import { MatchService } from './match.service';
import { MatchController } from './presentation/match.controller';
import { ApiFootballRepository } from './infrastructure/repositories/api-football.repository';
import { GetLiveMatchesUseCase } from './application/use-cases/get-live-matches.use-case';
import { ConfigModule } from '@nestjs/config';

export const MATCH_REPOSITORY = 'MATCH_REPOSITORY';

@Module({
  imports: [ConfigModule],
  controllers: [MatchController],
  providers: [
    MatchService,
    GetLiveMatchesUseCase,
    {
      provide: MATCH_REPOSITORY,
      useClass: ApiFootballRepository,
    },
  ],
})
export class MatchModule {}
