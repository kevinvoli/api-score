import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BacktestEngineService } from '../backtest/backtest-engine.service';
import { BacktestStrategy } from '../backtest/backtest.types';
import { baselineStrategy } from '../backtest/baseline.strategy';
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import {
  SmartRulesConfig,
  SmartRulesConfigService,
} from '../settings/smart-rules-config.service';
import { RunBacktestDto } from './dto/run-backtest.dto';

@Controller('audit/backtest')
export class AuditController {
  constructor(
    private readonly engine: BacktestEngineService,
    private readonly rulesConfig: SmartRulesConfigService,
    @InjectRepository(BacktestRun)
    private readonly runRepo: Repository<BacktestRun>,
    @InjectRepository(BetResult)
    private readonly betRepo: Repository<BetResult>,
  ) {}

  @Post()
  async runBacktest(@Body() dto: RunBacktestDto): Promise<BacktestRun> {
    const strategy = await this.resolveStrategy(dto);

    if (!strategy.entryRules || !strategy.staking || !strategy.odds) {
      throw new BadRequestException(
        'Stratégie invalide : entryRules, staking et odds sont requis',
      );
    }

    const window =
      dto.windowStart && dto.windowEnd
        ? { start: dto.windowStart, end: dto.windowEnd }
        : undefined;

    return this.engine.run(dto.name ?? strategy.name, strategy, window);
  }

  /**
   * Résout la stratégie à rejouer, par ordre de priorité :
   * 1. `strategy` complète fournie telle quelle (usage avancé / futurs modèles) ;
   * 2. `entryRules` (LOT A.5) : config de règles à tester, encapsulée dans la
   *    stratégie baseline — c'est le chemin emprunté par le bouton
   *    « Tester cette configuration en backtest » de Paramètres, qui envoie
   *    la config en cours d'édition, pas encore sauvegardée ;
   * 3. à défaut, la config actuellement persistée (comportement historique).
   */
  private async resolveStrategy(
    dto: RunBacktestDto,
  ): Promise<BacktestStrategy> {
    if (dto.strategy) {
      return dto.strategy as unknown as BacktestStrategy;
    }
    const entryRules = dto.entryRules
      ? (dto.entryRules as unknown as SmartRulesConfig)
      : await this.rulesConfig.getConfig();
    return baselineStrategy(entryRules);
  }

  @Get()
  async listRuns(): Promise<BacktestRun[]> {
    return this.runRepo.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  @Get(':id')
  async getRun(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<BacktestRun & { bets: BetResult[]; betTotal: number }> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException(`Run ${id} introuvable`);

    const [bets, betTotal] = await this.betRepo.findAndCount({
      where: { runId: id },
      order: { decisionAt: 'ASC' },
      take: Math.min(limit, 500),
      skip: offset,
    });

    return Object.assign(run, { bets, betTotal });
  }
}
