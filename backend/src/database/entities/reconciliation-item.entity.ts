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
  ReconciliationItemType,
  ReconciliationResult,
  ReconciliationSeverity,
} from '../../execution/execution.types';
import { BetOrder } from './bet-order.entity';
import { ReconciliationRun } from './reconciliation-run.entity';

/** Une comparaison : résultat, écart et preuve (valeurs attendue et observée, expurgées). */
@Entity('reconciliation_items')
@Index('idx_reconciliation_items_run', ['runId', 'severity'])
@Index('idx_reconciliation_items_order', ['orderId'])
export class ReconciliationItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'char', length: 36 })
  runId: string;

  @ManyToOne(() => ReconciliationRun, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'run_id' })
  run?: ReconciliationRun;

  @Column({ name: 'order_id', type: 'char', length: 36, nullable: true })
  orderId: string | null;

  @ManyToOne(() => BetOrder, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order?: BetOrder | null;

  @Column({ name: 'item_type', type: 'varchar', length: 20 })
  itemType: ReconciliationItemType;

  @Column({ type: 'varchar', length: 30 })
  result: ReconciliationResult;

  @Column({ type: 'varchar', length: 10 })
  severity: ReconciliationSeverity;

  @Column({ type: 'varchar', length: 255 })
  detail: string;

  @Column({ type: 'json', nullable: true })
  expected: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  observed: Record<string, unknown> | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;
}
