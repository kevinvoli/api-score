import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SimulationRunStatus = 'RUNNING' | 'STOPPED';

/** Politique de risque et de cote figée au démarrage du run. */
export interface SimulationRiskSnapshot {
  maxQuoteAgeMs: number;
  executionLatencyMs: number;
  bookmakerKey: string | null;
  /** Montants décimaux en chaîne ; null = pas de plafond au-delà de la bankroll. */
  maxStakePerBet: string | null;
  maxOpenExposure: string | null;
}

const decimalString = {
  to: (value: string) => value,
  from: (value: string | null) => value,
};

@Entity('simulation_runs')
@Index('uq_simulation_runs_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
@Index('idx_simulation_runs_status', ['status'])
export class SimulationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'strategy_version', type: 'varchar', length: 40 })
  strategyVersion: string;

  @Column({ name: 'strategy_snapshot', type: 'json' })
  strategySnapshot: Record<string, unknown>;

  @Column({ name: 'risk_snapshot', type: 'json' })
  riskSnapshot: SimulationRiskSnapshot;

  /** Empreinte du contenu de démarrage : rejouer la même clé avec un autre contenu est refusé. */
  @Column({
    name: 'config_hash',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  configHash: string;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({
    name: 'initial_bankroll',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  initialBankroll: string;

  @Column({ type: 'varchar', length: 20 })
  status: SimulationRunStatus;

  @Column({
    name: 'requested_by_user_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  requestedByUserId: string | null;

  @Column({ name: 'started_at', type: 'datetime', precision: 3 })
  startedAt: Date;

  @Column({
    name: 'stopped_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  stoppedAt: Date | null;

  @Column({
    name: 'last_tick_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  lastTickAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  createdAt: Date;
}
