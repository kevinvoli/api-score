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
import { UpdateSmartRulesDto, HalfRuleDto } from './dto/update-smart-rules.dto';

/**
 * Garde-fou de cohérence (LOT A.6) : les règles de 1re mi-temps doivent être
 * triées par fenêtre croissante et exiger un seuil de tirs non décroissant.
 * `findMatchedRule` retient la PREMIÈRE règle qui correspond dans l'ordre du
 * tableau : un ordre non croissant ou un seuil qui redescend rend une règle
 * inatteignable ou incohérente sans que rien ne le signale à l'utilisateur.
 */
function assertConsistentFirstHalfRules(rules: HalfRuleDto[]): void {
  for (let i = 1; i < rules.length; i += 1) {
    const prev = rules[i - 1];
    const curr = rules[i];

    if (curr.maxElapsed <= prev.maxElapsed) {
      throw new BadRequestException(
        `Règles de 1re mi-temps mal ordonnées : la règle ${i + 1} ` +
          `(< ${curr.maxElapsed}') doit couvrir une fenêtre strictement plus ` +
          `large que la règle ${i} (< ${prev.maxElapsed}'), sans quoi la ` +
          'seconde ne se déclencherait jamais.',
      );
    }

    if (curr.minShots < prev.minShots) {
      throw new BadRequestException(
        `Seuil décroissant détecté entre la règle ${i} (≥ ${prev.minShots} ` +
          `tirs avant ${prev.maxElapsed}') et la règle ${i + 1} ` +
          `(≥ ${curr.minShots} tirs avant ${curr.maxElapsed}') : une fenêtre ` +
          'plus large ne peut pas exiger moins de tirs que la précédente.',
      );
    }
  }
}

@Controller('settings/smart-rules')
export class SmartRulesController {
  constructor(private readonly configService: SmartRulesConfigService) {}

  @Get()
  getConfig(): Promise<SmartRulesConfig> {
    return this.configService.getConfig();
  }

  @Put()
  updateConfig(@Body() dto: UpdateSmartRulesDto): Promise<SmartRulesConfig> {
    assertConsistentFirstHalfRules(dto.firstHalfRules);

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
