import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BankrollAccount } from './bankroll-account.entity';

export type ReconciliationRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

@Entity('reconciliation_runs')
@Index('uq_reconciliation_runs_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
@Index('idx_reconciliation_runs_account_created', ['accountId', 'createdAt'])
export class ReconciliationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  idempotencyKey: string;

  @Column({ name: 'account_id', type: 'char', length: 36 })
  accountId: string;

  @ManyToOne(() => BankrollAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account?: BankrollAccount;

  @Column({ name: 'range_from', type: 'datetime', precision: 3 })
  rangeFrom: Date;

  @Column({ name: 'range_to', type: 'datetime', precision: 3 })
  rangeTo: Date;

  @Column({ type: 'varchar', length: 20 })
  status: ReconciliationRunStatus;

  @Column({ name: 'critical_count', type: 'int', default: 0 })
  criticalCount: number;

  @Column({ type: 'json', nullable: true })
  summary: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @Column({
    name: 'requested_by_user_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  requestedByUserId: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @Column({
    name: 'completed_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  completedAt: Date | null;
}
