import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
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

  /** Historique paginé des coupons (PENDING / WON / LOST) */
  @Get('coupons')
  getCouponHistory(
    @Query('limit')  limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.smartSuggestionsService.getCouponHistory(
      limit  ? Number(limit)  : 50,
      offset ? Number(offset) : 0,
    );
  }

  @Get(':id')
  getRecommendation(@Param('id', ParseUUIDPipe) id: string) {
    return this.recommendationsService.getRecommendationById(id);
  }
}
