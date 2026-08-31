import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
} from '@nestjs/common';
import {
  SmartRulesConfigService,
  SmartRulesConfig,
  DEFAULT_CONFIG,
} from './smart-rules-config.service';
import { UpdateSmartRulesDto } from './dto/update-smart-rules.dto';

@Controller('settings/smart-rules')
export class SmartRulesController {
  constructor(private readonly configService: SmartRulesConfigService) {}

  @Get()
  getConfig(): Promise<SmartRulesConfig> {
    return this.configService.getConfig();
  }

  @Put()
  updateConfig(@Body() dto: UpdateSmartRulesDto): Promise<SmartRulesConfig> {
    const windows = dto.firstHalfRules.map((r) => r.maxElapsed);
    // findMatchedRule retient la PREMIÈRE fenêtre qui correspond : deux règles
    // partageant le même maxElapsed rendent la seconde inatteignable.
    if (new Set(windows).size !== windows.length) {
      throw new BadRequestException(
        'Deux règles de 1re mi-temps partagent la même fenêtre (maxElapsed) : la seconde ne se déclencherait jamais.',
      );
    }

    return this.configService.updateConfig({
      signal: dto.signal ?? DEFAULT_CONFIG.signal,
      scoreStateModifiers:
        dto.scoreStateModifiers ?? DEFAULT_CONFIG.scoreStateModifiers,
      firstHalfRules: dto.firstHalfRules,
      secondHalfRule: dto.secondHalfRule,
      odds: dto.odds ?? DEFAULT_CONFIG.odds,
    });
  }
}
