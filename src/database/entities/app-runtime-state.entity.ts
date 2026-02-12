import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_runtime_state')
@Unique('uq_app_runtime_state_key', ['key'])
export class AppRuntimeState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  key: string;

  @Column({ type: 'jsonb' })
  value: Record<string, unknown>;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
