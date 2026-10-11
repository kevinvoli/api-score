import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedPrincipal, UserRole } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BankrollAccount } from '../database/entities/bankroll-account.entity';
import { ExecutionGateEvidence } from '../database/entities/execution-gate-evidence.entity';
import { ReconciliationItem } from '../database/entities/reconciliation-item.entity';
import { ReconciliationRun } from '../database/entities/reconciliation-run.entity';
import { RiskPolicy } from '../database/entities/risk-policy.entity';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { StartReconciliationDto } from './dto/start-reconciliation.dto';
import { OrderExecutionService, OrderView } from './order-execution.service';
import { ReconciliationService } from './reconciliation.service';
import { ChangeExecutionModeDto } from './dto/change-execution-mode.dto';
import { CreateRiskPolicyDto } from './dto/create-risk-policy.dto';
import { RecordGateEvidenceDto } from './dto/record-gate-evidence.dto';
import { StopExecutionDto } from './dto/stop-execution.dto';
import {
  ControlSnapshot,
  ExecutionControlService,
} from './execution-control.service';
import { DecimalString, fromCents, toCents } from './execution.types';
import { GatePolicyService } from './gate-policy.service';

export interface RiskLimitsView {
  version: number;
  currency: string;
  maxStakePerBet: DecimalString;
  maxDailyStake: DecimalString;
  maxDailyLoss: DecimalString;
  maxOpenExposure: DecimalString;
  maxQuoteAgeMs: number;
}

export interface ControlView extends ControlSnapshot {
  activeLimits: RiskLimitsView | null;
  /** Santé du dernier run de réconciliation, tous comptes confondus. */
  reconciliation: {
    status: 'NEVER_RUN' | ReconciliationRun['status'];
    lastRunAt: Date | null;
    criticalCount: number;
  };
}

export interface AccountView {
  id: string;
  mode: string;
  operatorKey: string;
  currency: string;
  availableBalance: DecimalString;
  reservedBalance: DecimalString;
  exposure: DecimalString;
  totalBalance: DecimalString;
  version: number;
  /** Plafonds actifs, seulement s'ils sont dans la même devise que le compte. */
  activeLimits: RiskLimitsView | null;
}

const limitsView = (policy: RiskPolicy | null): RiskLimitsView | null =>
  policy
    ? {
        version: policy.version,
        currency: policy.currency,
        maxStakePerBet: policy.maxStakePerBet,
        maxDailyStake: policy.maxDailyStake,
        maxDailyLoss: policy.maxDailyLoss,
        maxOpenExposure: policy.maxOpenExposure,
        maxQuoteAgeMs: policy.maxQuoteAgeMs,
      }
    : null;

function accountView(
  account: BankrollAccount,
  policy: RiskPolicy | null,
): AccountView {
  const available = toCents(account.availableBalance);
  const reserved = toCents(account.reservedBalance);
  return {
    id: account.id,
    mode: account.mode,
    operatorKey: account.operatorKey,
    currency: account.currency,
    availableBalance: account.availableBalance,
    reservedBalance: account.reservedBalance,
    exposure: account.reservedBalance,
    totalBalance: fromCents(available + reserved),
    version: account.version,
    activeLimits:
      policy && policy.currency === account.currency
        ? limitsView(policy)
        : null,
  };
}

/** Contrat PLAN 3.4 (partie lot 6). Les ordres et réconciliations arrivent au lot 7. */
@Controller('execution')
export class ExecutionController {
  constructor(
    private readonly control: ExecutionControlService,
    private readonly gates: GatePolicyService,
    @InjectRepository(BankrollAccount)
    private readonly accounts: Repository<BankrollAccount>,
    private readonly orders: OrderExecutionService,
    private readonly reconciliation: ReconciliationService,
    @InjectRepository(ReconciliationRun)
    private readonly runs: Repository<ReconciliationRun>,
  ) {}

  @Get('control')
  @Roles(UserRole.VIEWER)
  async getControl(): Promise<ControlView> {
    const snapshot = await this.control.readControl();
    const policy = await this.control
      .activePolicy(snapshot.activeRiskPolicyId)
      .catch(() => null);
    return {
      ...snapshot,
      activeLimits: limitsView(policy),
      reconciliation: await this.reconciliationHealth(),
    };
  }

  @Put('control/stop')
  @Roles(UserRole.ADMIN)
  stop(
    @Body() dto: StopExecutionDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ): Promise<ControlSnapshot> {
    return this.control.stop(
      dto.reason,
      user.id,
      'MANUAL',
      dto.expectedVersion,
    );
  }

  @Put('control/mode')
  @Roles(UserRole.ADMIN)
  changeMode(
    @Body() dto: ChangeExecutionModeDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ): Promise<ControlSnapshot> {
    return this.control.changeMode(
      {
        targetMode: dto.targetMode,
        reason: dto.reason,
        expectedVersion: dto.expectedVersion,
        gateEvidenceIds: dto.gateEvidenceIds,
      },
      user.id,
    );
  }

  @Post('risk-policies')
  @Roles(UserRole.ADMIN)
  async createRiskPolicy(
    @Body() dto: CreateRiskPolicyDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ): Promise<RiskLimitsView> {
    const stake = toCents(dto.maxStakePerBet);
    if (
      stake > toCents(dto.maxDailyStake) ||
      stake > toCents(dto.maxOpenExposure)
    ) {
      throw new BadRequestException(
        'maxStakePerBet doit être inférieur ou égal à maxDailyStake et à maxOpenExposure',
      );
    }
    const policy = await this.control.createRiskPolicy(dto, user.id);
    return limitsView(policy)!;
  }

  @Post('gate-evidence')
  @Roles(UserRole.ADMIN)
  async recordGateEvidence(
    @Body() dto: RecordGateEvidenceDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ): Promise<ExecutionGateEvidence> {
    const snapshot = await this.control.readControl();
    const controlId = await this.control.controlId();
    if (!snapshot.readable || !controlId) {
      throw new BadRequestException(
        'Contrôle d’exécution illisible : preuve non enregistrable',
      );
    }
    return this.gates.record({ ...dto, controlId }, user.id);
  }

  /** Comptes de bankroll (un par mode, opérateur et devise) : peu nombreux, borné à 100. */
  @Get('accounts')
  @Roles(UserRole.VIEWER)
  async listAccounts(): Promise<AccountView[]> {
    const accounts = await this.accounts.find({
      order: { mode: 'ASC', operatorKey: 'ASC', currency: 'ASC' },
      take: 100,
    });
    const policy = await this.currentPolicy();
    return accounts.map((account) => accountView(account, policy));
  }

  @Get('accounts/:id')
  @Roles(UserRole.VIEWER)
  async getAccount(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountView> {
    const account = await this.accounts.findOneBy({ id });
    if (!account) throw new NotFoundException(`Compte ${id} introuvable`);
    return accountView(account, await this.currentPolicy());
  }

  private async currentPolicy(): Promise<RiskPolicy | null> {
    const snapshot = await this.control.readControl();
    return this.control
      .activePolicy(snapshot.activeRiskPolicyId)
      .catch(() => null);
  }

  @Get('orders')
  @Roles(UserRole.VIEWER)
  listOrders(
    @Query() query: ListOrdersQueryDto,
  ): Promise<{ data: OrderView[]; nextCursor: string | null }> {
    if (query.from && query.to && query.from >= query.to) {
      throw new BadRequestException('from doit précéder to');
    }
    return this.orders.listOrders({
      accountId: query.accountId,
      status: query.status,
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      limit: query.limit ?? 50,
    });
  }

  @Post('reconciliations')
  @Roles(UserRole.OPERATOR)
  @HttpCode(202)
  startReconciliation(
    @Body() dto: StartReconciliationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ): Promise<{ runId: string }> {
    const range = dto.to.getTime() - dto.from.getTime();
    if (range <= 0 || range > 31 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'La plage doit être positive et ne pas dépasser 31 jours',
      );
    }
    return this.reconciliation.start(
      {
        accountId: dto.accountId,
        from: dto.from,
        to: dto.to,
        idempotencyKey: dto.idempotencyKey,
      },
      user.id,
    );
  }

  @Get('reconciliations/:id')
  @Roles(UserRole.VIEWER)
  getReconciliation(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReconciliationRun & { items: ReconciliationItem[] }> {
    return this.reconciliation.getRun(id);
  }

  private async reconciliationHealth(): Promise<ControlView['reconciliation']> {
    const last = await this.runs
      .find({ order: { createdAt: 'DESC' }, take: 1 })
      .catch(() => [] as ReconciliationRun[]);
    return last.length
      ? {
          status: last[0].status,
          lastRunAt: last[0].completedAt ?? last[0].createdAt,
          criticalCount: last[0].criticalCount,
        }
      : { status: 'NEVER_RUN', lastRunAt: null, criticalCount: 0 };
  }
}
