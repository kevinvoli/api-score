import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { StopSource } from '../../execution/execution.types';
import { RiskPolicy } from './risk-policy.entity';

/**
 * Kill switch persistant (ADR 003) : une seule ligne `scope = 'GLOBAL'`, versionnée.
 * `mode` est un varchar contrôlé par le domaine : une valeur inconnue est lue comme DISABLED.
 */
@Entity('execution_controls')
@Index('uq_execution_controls_scope', ['scope'], { unique: true })
export class ExecutionControl {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  scope: string;

  @Column({ type: 'varchar', length: 20 })
  mode: string;

  @Column({
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string | number) => Number(v),
    },
  })
  version: number;

  @Column({
    name: 'active_risk_policy_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  activeRiskPolicyId: string | null;

  @ManyToOne(() => RiskPolicy, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'active_risk_policy_id' })
  activeRiskPolicy?: RiskPolicy | null;

  @Column({ name: 'stop_reason', type: 'varchar', length: 500, nullable: true })
  stopReason: string | null;

  @Column({ name: 'stop_source', type: 'varchar', length: 20, nullable: true })
  stopSource: StopSource | null;

  @Column({
    name: 'changed_by_user_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  changedByUserId: string | null;

  @Column({
    name: 'changed_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  changedAt: Date;
}
