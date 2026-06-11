import { Module } from '@nestjs/common';
import { MatchService } from './match.service';
import { MatchController } from './match.controller';
import { ProviderApiFootballModule } from '../provider-api-football/provider-api-football.module';

@Module({
  imports: [ProviderApiFootballModule],
  controllers: [MatchController],
  providers: [MatchService],
})
export class MatchModule {}
