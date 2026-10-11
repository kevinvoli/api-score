import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../auth/auth.types';
import { AuthSession } from './auth-session.entity';
import { OperationAuditEvent } from './operation-audit-event.entity';

@Entity('auth_users')
@Index('uq_auth_users_email', ['email'], { unique: true })
@Index('idx_auth_users_role', ['role'])
export class AuthUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 320,
    charset: 'utf8mb4',
    collation: 'utf8mb4_bin',
  })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({
    name: 'disabled_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  disabledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;

  @OneToMany(() => AuthSession, (session) => session.user)
  sessions?: AuthSession[];

  @OneToMany(() => OperationAuditEvent, (event) => event.actor)
  auditEvents?: OperationAuditEvent[];
}
