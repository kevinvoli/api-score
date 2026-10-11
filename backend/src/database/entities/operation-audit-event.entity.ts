import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuthUser } from './auth-user.entity';

@Entity('operation_audit_events')
@Index('idx_operation_audit_events_actor_user_id', ['actorUserId'])
@Index('idx_operation_audit_events_created_at', ['createdAt'])
@Index('idx_operation_audit_events_action_target_created_at', [
  'action',
  'targetType',
  'targetId',
  'createdAt',
])
export class OperationAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_user_id', type: 'char', length: 36, nullable: true })
  actorUserId: string | null;

  @ManyToOne(() => AuthUser, (user) => user.auditEvents, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'actor_user_id' })
  actor?: AuthUser | null;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 80 })
  targetType: string;

  @Column({ name: 'target_id', type: 'varchar', length: 320 })
  targetId: string;

  @Column({ name: 'trace_id', type: 'varchar', length: 64, nullable: true })
  traceId: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
