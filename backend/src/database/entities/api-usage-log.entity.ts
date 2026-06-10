import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('api_usage_logs')
@Index('idx_api_usage_logs_called_at', ['calledAt'])
@Index('idx_api_usage_logs_endpoint', ['endpoint'])
export class ApiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  provider: string;

  @Column({ type: 'varchar', length: 255 })
  endpoint: string;

  @Column({ type: 'json', nullable: true })
  requestParams: Record<string, unknown> | null;

  @Column({ type: 'int' })
  responseStatus: number;

  @Column({ type: 'int' })
  latencyMs: number;

  @Column({ type: 'int', nullable: true })
  rateLimitRemaining: number | null;

  @Column({ type: 'datetime', nullable: true })
  calledAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}

