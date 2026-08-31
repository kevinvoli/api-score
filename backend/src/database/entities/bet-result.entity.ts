import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BacktestRun } from './backtest-run.entity';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string | number | null) =>
    value === null ? null : Number(value),
};

@Entity('bet_results')
@Index('idx_bet_results_run_id', ['runId'])
@Index('idx_bet_results_outcome', ['outcome'])
@Index('idx_bet_results_run_market', ['runId', 'marketType'])
export class BetResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36 })
  runId: string;

  @ManyToOne(() => BacktestRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run?: BacktestRun;

  // Lien logique, pas de FK : un run doit survivre à la purge de fixtures.
  @Column({ type: 'char', length: 36 })
  fixtureId: string;

  @Column({ type: 'bigint' })
  providerFixtureId: string;

  @Column({ type: 'varchar', length: 80 })
  marketType: string;

  @Column({ type: 'varchar', length: 255 })
  selection: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ruleName: string | null;

  @Column({ type: 'int', nullable: true })
  teamId: number | null;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  isHomeTeam: boolean;

  @Column({ type: 'datetime' })
  decisionAt: Date;

  @Column({ type: 'int', nullable: true })
  elapsedAtDecision: number | null;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 3,
    transformer: decimalTransformer,
  })
  oddAtDecision: number;

  @Column({ type: 'varchar', length: 20 })
  oddSource: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  edgePct: number | null;

  @Column({ type: 'int', nullable: true })
  confidenceScore: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  stake: number;

  @Column({ type: 'varchar', length: 12 })
  outcome: 'WON' | 'LOST' | 'NO_RESULT';

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
    transformer: decimalTransformer,
  })
  profit: number;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
