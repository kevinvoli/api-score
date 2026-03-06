import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { GetLiveRecommendationsQueryDto } from './dto/get-live-recommendations-query.dto';
import { RecommendationsService } from './recommendations.service';
import { SmartSuggestionsService } from './smart-suggestions.service';

@Controller('live/recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
    private readonly smartSuggestionsService: SmartSuggestionsService,
  ) {}

  @Get()
  getLiveRecommendations(@Query() query: GetLiveRecommendationsQueryDto) {
    return this.recommendationsService.getLiveRecommendations(query);
  }

  /** Suggestions calculées en temps réel depuis les règles métier (1H + 2H) */
  @Get('smart')
  getSmartSuggestions() {
    return this.smartSuggestionsService.getAllSuggestions();
  }

  @Get(':id')
  getRecommendation(@Param('id', ParseUUIDPipe) id: string) {
    return this.recommendationsService.getRecommendationById(id);
  }
}
