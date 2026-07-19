import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('backtest_runs')
@Index('idx_backtest_runs_status', ['status'])
@Index('idx_backtest_runs_created_at', ['createdAt'])
export class BacktestRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'json' })
  strategy: Record<string, unknown>;

  @Column({ type: 'datetime' })
  windowStart: Date;

  @Column({ type: 'datetime' })
  windowEnd: Date;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

  @Column({ type: 'json', nullable: true })
  kpis: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  totalBets: number;

  @Column({ type: 'int', default: 0 })
  wonBets: number;

  @Column({ type: 'int', default: 0 })
  lostBets: number;

  @Column({ type: 'int', default: 0 })
  noResultBets: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;
}
