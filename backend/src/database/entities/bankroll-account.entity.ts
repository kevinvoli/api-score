import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

const decimalString = {
  to: (value: string) => value,
  from: (value: string) => value,
};

/**
 * Compte de bankroll par (mode, opérateur, devise). Ses soldes ne changent que via le
 * `LedgerService`, sous verrou pessimiste, avec incrément de version.
 */
@Entity('bankroll_accounts')
@Index(
  'uq_bankroll_accounts_mode_operator_currency',
  ['mode', 'operatorKey', 'currency'],
  { unique: true },
)
export class BankrollAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  mode: string;

  @Column({ name: 'operator_key', type: 'varchar', length: 40 })
  operatorKey: string;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({
    name: 'available_balance',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  availableBalance: string;

  @Column({
    name: 'reserved_balance',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  reservedBalance: string;

  @Column({
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string | number) => Number(v),
    },
  })
  version: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
