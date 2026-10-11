import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankrollAccount } from '../database/entities/bankroll-account.entity';
import { BankrollLedgerEntry } from '../database/entities/bankroll-ledger-entry.entity';
import { ExecutionControl } from '../database/entities/execution-control.entity';
import { ExecutionGateEvidence } from '../database/entities/execution-gate-evidence.entity';
import { RiskPolicy } from '../database/entities/risk-policy.entity';
import { ExecutionControlService } from './execution-control.service';
import { ExecutionController } from './execution.controller';
import { GatePolicyService } from './gate-policy.service';
import { LedgerService } from './ledger.service';
import { RiskEngineService } from './risk-engine.service';
import { BetDecision } from '../database/entities/bet-decision.entity';
import { BetOrder } from '../database/entities/bet-order.entity';
import { BetReceipt } from '../database/entities/bet-receipt.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { ReconciliationItem } from '../database/entities/reconciliation-item.entity';
import { ReconciliationRun } from '../database/entities/reconciliation-run.entity';
import { SimulationRun } from '../database/entities/simulation-run.entity';
import { DeterministicSandboxAdapter } from './adapters/deterministic-sandbox.adapter';
import { PaperOperatorAdapter } from './adapters/paper-operator.adapter';
import { OPERATOR_PORTS, OperatorPortsByMode } from './operator.port';
import { OrderExecutionService } from './order-execution.service';
import { ReconciliationScheduler } from './reconciliation.scheduler';
import { ReconciliationService } from './reconciliation.service';

/**
 * Contrôle d'exécution, risque, ledger, pipeline d'ordre et réconciliation. Adaptateurs :
 * papier (SIMULATION) et sandbox déterministe (SANDBOX). Aucun adaptateur réel : un ordre
 * en LIVE_CANARY est refusé jusqu'au lot 8.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExecutionControl,
      RiskPolicy,
      ExecutionGateEvidence,
      BankrollAccount,
      BankrollLedgerEntry,
      BetOrder,
      BetReceipt,
      ReconciliationRun,
      ReconciliationItem,
      BetDecision,
      SimulationRun,
      Fixture,
    ]),
  ],
  controllers: [ExecutionController],
  providers: [
    ExecutionControlService,
    GatePolicyService,
    LedgerService,
    RiskEngineService,
    PaperOperatorAdapter,
    DeterministicSandboxAdapter,
    {
      // LIVE_CANARY volontairement absent : aucun adaptateur réel avant le lot 8.
      provide: OPERATOR_PORTS,
      useFactory: (
        paper: PaperOperatorAdapter,
        sandbox: DeterministicSandboxAdapter,
      ): OperatorPortsByMode => ({ SIMULATION: paper, SANDBOX: sandbox }),
      inject: [PaperOperatorAdapter, DeterministicSandboxAdapter],
    },
    OrderExecutionService,
    ReconciliationService,
    ReconciliationScheduler,
  ],
  exports: [
    ExecutionControlService,
    LedgerService,
    RiskEngineService,
    OrderExecutionService,
    ReconciliationService,
  ],
})
export class ExecutionModule {}
