import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
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
import { WalkForwardService } from '../backtest/walk-forward.service';
import { AuthenticatedPrincipal, UserRole } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { WalkForwardFold } from '../database/entities/walk-forward-fold.entity';
import { WalkForwardRun } from '../database/entities/walk-forward-run.entity';
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import {
  SmartRulesConfig,
  SmartRulesConfigService,
} from '../settings/smart-rules-config.service';
import { RunBacktestDto } from './dto/run-backtest.dto';
import { RunWalkForwardDto } from './dto/run-walk-forward.dto';
import { isWalkForwardStrategy } from '../backtest/strategy.guard';

const DAY_MS = 86_400_000;
const MAX_WALK_FORWARD_RANGE_DAYS = 1_096;

@Controller('audit')
export class AuditController {
  constructor(
    private readonly engine: BacktestEngineService,
    private readonly walkForward: WalkForwardService,
    private readonly rulesConfig: SmartRulesConfigService,
    @InjectRepository(BacktestRun)
    private readonly runRepo: Repository<BacktestRun>,
    @InjectRepository(BetResult)
    private readonly betRepo: Repository<BetResult>,
  ) {}

  @Post('backtest')
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

  @Get('backtest')
  async listRuns(): Promise<BacktestRun[]> {
    return this.runRepo.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  @Get('backtest/:id')
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

  /** Contrat PLAN 3.3 : lance un walk-forward figé et rend la main immédiatement. */
  @Post('walk-forward')
  @Roles(UserRole.ADMIN)
  @HttpCode(202)
  async runWalkForward(
    @Body() dto: RunWalkForwardDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ): Promise<{ runId: string }> {
    if (!isWalkForwardStrategy(dto.strategy)) {
      throw new BadRequestException(
        'Stratégie invalide : name, markets, minEdgePct, minConfidence, bankroll, staking, odds et entryRules complets sont requis',
      );
    }
    const rangeMs = dto.to.getTime() - dto.from.getTime();
    if (rangeMs <= 0 || rangeMs > MAX_WALK_FORWARD_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(
        `La plage from/to doit être positive et ne pas dépasser ${MAX_WALK_FORWARD_RANGE_DAYS} jours`,
      );
    }

    return this.walkForward.start(
      {
        strategyVersion: dto.strategyVersion,
        strategy: dto.strategy,
        trainWindowDays: dto.trainWindowDays,
        validationWindowDays: dto.validationWindowDays,
        testWindowDays: dto.testWindowDays,
        stepDays: dto.stepDays,
        from: dto.from,
        to: dto.to,
        bookmakerKey: dto.bookmakerKey,
        maxQuoteAgeMs: dto.maxQuoteAgeMs,
        executionLatencyMs: dto.executionLatencyMs,
      },
      user.id,
    );
  }

  @Get('walk-forward')
  @Roles(UserRole.VIEWER)
  listWalkForward(): Promise<WalkForwardRun[]> {
    return this.walkForward.listRuns();
  }

  @Get('walk-forward/:id')
  @Roles(UserRole.VIEWER)
  async getWalkForward(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WalkForwardRun & { folds: WalkForwardFold[] }> {
    const run = await this.walkForward.getRun(id);
    if (!run) throw new NotFoundException(`Walk-forward ${id} introuvable`);
    return run;
  }
}
