import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { GateKey, GateVerdict } from '../../execution/execution.types';
import { ExecutionControl } from './execution-control.entity';

/** Preuve immuable d'une gate, enregistrée et approuvée par un ADMIN identifié. */
@Entity('execution_gate_evidence')
@Index('uq_execution_gate_evidence_gate_report', ['gateKey', 'reportHash'], {
  unique: true,
})
@Index('idx_execution_gate_evidence_control', ['controlId', 'gateKey'])
export class ExecutionGateEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'control_id', type: 'char', length: 36 })
  controlId: string;

  @ManyToOne(() => ExecutionControl, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'control_id' })
  control?: ExecutionControl;

  @Column({ name: 'gate_key', type: 'varchar', length: 10 })
  gateKey: GateKey;

  @Column({ name: 'period_from', type: 'datetime', precision: 3 })
  periodFrom: Date;

  @Column({ name: 'period_to', type: 'datetime', precision: 3 })
  periodTo: Date;

  @Column({ type: 'json' })
  metrics: Record<string, unknown>;

  @Column({
    name: 'report_hash',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  reportHash: string;

  @Column({ type: 'varchar', length: 10 })
  verdict: GateVerdict;

  @Column({ name: 'approved_by_user_id', type: 'char', length: 36 })
  approvedByUserId: string;

  @Column({ name: 'approved_at', type: 'datetime', precision: 6 })
  approvedAt: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;
}
