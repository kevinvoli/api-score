import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { isWalkForwardStrategy } from '../backtest/strategy.guard';
import { AuthenticatedPrincipal, UserRole } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SimulationRun } from '../database/entities/simulation-run.entity';
import { ListDecisionsQueryDto } from './dto/list-decisions-query.dto';
import { StartSimulationDto } from './dto/start-simulation.dto';
import {
  DecisionView,
  SimulationService,
  SimulationSummary,
} from './simulation.service';

const DEFAULT_DECISIONS_PAGE = 50;

/** Contrat PLAN 3.3. Aucun de ces points ne contacte un opérateur : tout est virtuel. */
@Controller('simulation/runs')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  async start(
    @Body() dto: StartSimulationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ): Promise<SimulationRun> {
    if (!isWalkForwardStrategy(dto.strategy)) {
      throw new BadRequestException(
        'Stratégie invalide : name, markets, minEdgePct, minConfidence, bankroll, staking, odds et entryRules complets sont requis',
      );
    }
    return this.simulation.start(
      {
        idempotencyKey: dto.idempotencyKey,
        name: dto.name,
        strategyVersion: dto.strategyVersion,
        strategy: dto.strategy,
        currency: dto.currency,
        initialBankroll: dto.initialBankroll,
        maxQuoteAgeMs: dto.maxQuoteAgeMs,
        executionLatencyMs: dto.executionLatencyMs,
        bookmakerKey: dto.bookmakerKey,
        maxStakePerBet: dto.risk?.maxStakePerBet,
        maxOpenExposure: dto.risk?.maxOpenExposure,
      },
      user.id,
    );
  }

  @Get()
  @Roles(UserRole.VIEWER)
  list(): Promise<SimulationRun[]> {
    return this.simulation.listRuns();
  }

  @Post(':id/stop')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  stop(@Param('id', ParseUUIDPipe) id: string): Promise<SimulationRun> {
    return this.simulation.stop(id);
  }

  @Get(':id/decisions')
  @Roles(UserRole.VIEWER)
  listDecisions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListDecisionsQueryDto,
  ): Promise<{ data: DecisionView[]; nextCursor: string | null }> {
    if (query.from && query.to && query.from >= query.to) {
      throw new BadRequestException('from doit précéder to');
    }
    return this.simulation.listDecisions(id, {
      cursor: query.cursor,
      limit: query.limit ?? DEFAULT_DECISIONS_PAGE,
      status: query.status,
      marketType: query.marketType,
      from: query.from,
      to: query.to,
    });
  }

  @Get(':id/summary')
  @Roles(UserRole.VIEWER)
  summary(@Param('id', ParseUUIDPipe) id: string): Promise<SimulationSummary> {
    return this.simulation.summary(id);
  }
}
