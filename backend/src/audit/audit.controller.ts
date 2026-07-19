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
import { SmartRulesConfigService } from '../settings/smart-rules-config.service';
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
    const strategy = dto.strategy
      ? (dto.strategy as unknown as BacktestStrategy)
      : baselineStrategy(await this.rulesConfig.getConfig());

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
