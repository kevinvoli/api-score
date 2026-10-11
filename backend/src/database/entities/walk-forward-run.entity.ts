import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { WalkForwardFold } from './walk-forward-fold.entity';

export type WalkForwardRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

@Entity('walk_forward_runs')
@Index('idx_walk_forward_runs_status', ['status'])
@Index('idx_walk_forward_runs_created_at', ['createdAt'])
export class WalkForwardRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'strategy_version', type: 'varchar', length: 40 })
  strategyVersion: string;

  /** Copie figée de la stratégie au lancement : une modification ultérieure n'a aucun effet. */
  @Column({ name: 'strategy_snapshot', type: 'json' })
  strategySnapshot: Record<string, unknown>;

  /** Fenêtres, paramètres de cote et seuils d'éligibilité figés avant mesure. */
  @Column({ type: 'json' })
  config: Record<string, unknown>;

  @Column({
    name: 'config_hash',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  configHash: string;

  @Column({
    name: 'dataset_hash',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
    nullable: true,
  })
  datasetHash: string | null;

  @Column({
    name: 'result_hash',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
    nullable: true,
  })
  resultHash: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: WalkForwardRunStatus;

  @Column({ name: 'range_from', type: 'datetime', precision: 3 })
  rangeFrom: Date;

  @Column({ name: 'range_to', type: 'datetime', precision: 3 })
  rangeTo: Date;

  /** Agrégat des fenêtres de test des folds éligibles. */
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
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  createdAt: Date;

  @Column({
    name: 'started_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  startedAt: Date | null;

  @Column({
    name: 'completed_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  completedAt: Date | null;

  @OneToMany('WalkForwardFold', (fold: WalkForwardFold) => fold.run)
  folds?: WalkForwardFold[];
}
