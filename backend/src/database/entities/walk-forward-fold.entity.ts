import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalkForwardRun } from './walk-forward-run.entity';

export type WalkForwardFoldStatus = 'COMPLETED' | 'INELIGIBLE';

export type WalkForwardIneligibility =
  | 'INCOMPLETE_WINDOW'
  | 'NO_SIGNAL'
  | 'INSUFFICIENT_ODDS_COVERAGE';

@Entity('walk_forward_folds')
@Index('uq_walk_forward_folds_run_index', ['runId', 'foldIndex'], {
  unique: true,
})
export class WalkForwardFold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'char', length: 36 })
  runId: string;

  @ManyToOne(() => WalkForwardRun, (run) => run.folds, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'run_id' })
  run?: WalkForwardRun;

  @Column({ name: 'fold_index', type: 'int' })
  foldIndex: number;

  @Column({ name: 'train_from', type: 'datetime', precision: 3 })
  trainFrom: Date;

  @Column({ name: 'train_to', type: 'datetime', precision: 3 })
  trainTo: Date;

  @Column({ name: 'validation_from', type: 'datetime', precision: 3 })
  validationFrom: Date;

  @Column({ name: 'validation_to', type: 'datetime', precision: 3 })
  validationTo: Date;

  @Column({ name: 'test_from', type: 'datetime', precision: 3 })
  testFrom: Date;

  @Column({ name: 'test_to', type: 'datetime', precision: 3 })
  testTo: Date;

  @Column({ type: 'varchar', length: 20 })
  status: WalkForwardFoldStatus;

  @Column({
    name: 'ineligibility_reason',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  ineligibilityReason: WalkForwardIneligibility | null;

  /** KPIs et comptabilité des signaux par fenêtre (train, validation, test). */
  @Column({ type: 'json' })
  metrics: Record<string, unknown>;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  createdAt: Date;
}
