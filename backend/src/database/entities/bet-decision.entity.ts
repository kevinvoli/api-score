import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  DecisionOutcome,
  DecisionStatus,
  RejectionCode,
} from '../../execution/execution.types';
import { OddsSnapshot } from './odds-snapshot.entity';
import { SimulationRun } from './simulation-run.entity';

const decimalString = {
  to: (value: string | null) => value,
  from: (value: string | null) => value,
};

const oddTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null ? null : Number(value),
};

/**
 * Journal append-mostly d'une simulation : une ligne par signal évalué, accepté
 * ou rejeté. La cote est copiée (valeur et horodatages) pour survivre à la purge
 * des `odds_snapshots` ; la référence au snapshot passe alors à NULL.
 */
@Entity('bet_decisions')
@Index('uq_bet_decisions_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
@Index('idx_bet_decisions_run_decided', ['simulationRunId', 'decidedAt', 'id'])
@Index('idx_bet_decisions_run_status', ['simulationRunId', 'status'])
@Index('idx_bet_decisions_run_signal', ['simulationRunId', 'signalKey'])
export class BetDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'simulation_run_id', type: 'char', length: 36 })
  simulationRunId: string;

  @ManyToOne(() => SimulationRun, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'simulation_run_id' })
  simulationRun?: SimulationRun;

  /** sha256(run, fixture, équipe, marché) : regroupe les lignes d'un même signal. */
  @Column({
    name: 'signal_key',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  signalKey: string;

  /** Unicité métier : deux ticks concurrents ne peuvent écrire deux fois la même décision. */
  @Column({
    name: 'idempotency_key',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  idempotencyKey: string;

  @Column({ name: 'fixture_id', type: 'char', length: 36 })
  fixtureId: string;

  @Column({ name: 'provider_fixture_id', type: 'bigint' })
  providerFixtureId: string;

  @Column({ name: 'team_id', type: 'int', nullable: true })
  teamId: number | null;

  @Column({ name: 'is_home_team', type: 'boolean' })
  isHomeTeam: boolean;

  @Column({ name: 'market_type', type: 'varchar', length: 80 })
  marketType: string;

  @Column({ name: 'market_key', type: 'varchar', length: 80 })
  marketKey: string;

  @Column({ name: 'selection_key', type: 'varchar', length: 80 })
  selectionKey: string;

  @Column({ type: 'varchar', length: 255 })
  selection: string;

  @Column({ name: 'rule_name', type: 'varchar', length: 80 })
  ruleName: string;

  @Column({ name: 'elapsed_at_decision', type: 'int', nullable: true })
  elapsedAtDecision: number | null;

  @Column({
    name: 'min_acceptable_odd',
    type: 'decimal',
    precision: 8,
    scale: 3,
    transformer: oddTransformer,
  })
  minAcceptableOdd: number;

  @Column({ type: 'varchar', length: 20 })
  status: DecisionStatus;

  @Column({
    name: 'rejection_code',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  rejectionCode: RejectionCode | null;

  @Column({ name: 'decided_at', type: 'datetime', precision: 3 })
  decidedAt: Date;

  @Column({ type: 'char', length: 3 })
  currency: string;

  /** Mise virtuelle réservée ; null pour un rejet avant réservation. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalString,
  })
  stake: string | null;

  @Column({
    name: 'decision_odds_snapshot_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  decisionOddsSnapshotId: string | null;

  /** SET NULL : la purge d'un snapshot ne supprime jamais la décision, qui en garde une copie. */
  @ManyToOne(() => OddsSnapshot, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'decision_odds_snapshot_id' })
  decisionOddsSnapshot?: OddsSnapshot | null;

  @Column({
    name: 'decision_odd',
    type: 'decimal',
    precision: 8,
    scale: 3,
    nullable: true,
    transformer: oddTransformer,
  })
  decisionOdd: number | null;

  @Column({
    name: 'decision_provider_key',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  decisionProviderKey: string | null;

  @Column({
    name: 'decision_bookmaker_key',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  decisionBookmakerKey: string | null;

  @Column({
    name: 'decision_observed_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  decisionObservedAt: Date | null;

  @Column({
    name: 'decision_received_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  decisionReceivedAt: Date | null;

  /** Instant où la cote d'exécution est recherchée : decidedAt + latence simulée. */
  @Column({
    name: 'execution_due_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  executionDueAt: Date | null;

  @Column({
    name: 'executable_odds_snapshot_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  executableOddsSnapshotId: string | null;

  @ManyToOne(() => OddsSnapshot, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'executable_odds_snapshot_id' })
  executableOddsSnapshot?: OddsSnapshot | null;

  @Column({
    name: 'executable_odd',
    type: 'decimal',
    precision: 8,
    scale: 3,
    nullable: true,
    transformer: oddTransformer,
  })
  executableOdd: number | null;

  @Column({
    name: 'executable_observed_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  executableObservedAt: Date | null;

  @Column({
    name: 'executable_received_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  executableReceivedAt: Date | null;

  /** (cote exécutée - cote de décision) / cote de décision, en % ; négatif = défavorable. */
  @Column({
    name: 'slippage_pct',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
    transformer: oddTransformer,
  })
  slippagePct: number | null;

  @Column({
    name: 'executed_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  executedAt: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome: DecisionOutcome | null;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalString,
  })
  profit: string | null;

  @Column({
    name: 'settled_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  settledAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  createdAt: Date;
}
