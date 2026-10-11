import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('auth_login_attempts')
export class AuthLoginAttempt {
  @PrimaryColumn({
    name: 'identifier_hash',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  identifierHash: string;

  @Column({ name: 'failed_count', type: 'smallint', unsigned: true })
  failedCount: number;

  @Column({ name: 'window_started_at', type: 'datetime', precision: 6 })
  windowStartedAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    precision: 6,
  })
  updatedAt: Date;
}
