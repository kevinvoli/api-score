import { Injectable } from '@nestjs/common';
import { CreateMatchDto } from './presentation/dto/create-match.dto';
import { GetLiveMatchesUseCase } from './application/use-cases/get-live-matches.use-case';

@Injectable()
export class MatchService {
  constructor(private readonly getLiveMatchesUseCase: GetLiveMatchesUseCase) {}

  async getLiveMatches() {
    return this.getLiveMatchesUseCase.execute();
  }

  create(createMatchDto: CreateMatchDto) {
    return 'This action adds a new match';
  }
}
