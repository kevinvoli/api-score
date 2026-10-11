import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { LedgerEntryType } from '../../execution/execution.types';
import { BankrollAccount } from './bankroll-account.entity';
import { BetOrder } from './bet-order.entity';

const decimalString = {
  to: (value: string) => value,
  from: (value: string) => value,
};

/**
 * Journal append-only. `amount` est l'effet signé sur le solde disponible, `reservedDelta`
 * l'effet sur le réservé ; les soldes après écriture sont recopiés pour l'audit.
 * Aucune mise à jour ni suppression applicative : seul `LedgerService.append*` écrit ici.
 */
@Entity('bankroll_ledger_entries')
@Index('uq_bankroll_ledger_entries_entry_key', ['entryKey'], { unique: true })
@Index(
  'uq_bankroll_ledger_entries_account_version',
  ['accountId', 'accountVersion'],
  {
    unique: true,
  },
)
@Index('idx_bankroll_ledger_entries_account_created', [
  'accountId',
  'createdAt',
  'id',
])
export class BankrollLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'char', length: 36 })
  accountId: string;

  @ManyToOne(() => BankrollAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account?: BankrollAccount;

  /** Ordre lié, le cas échéant (FK RESTRICT). */
  @Column({ name: 'order_id', type: 'char', length: 36, nullable: true })
  orderId: string | null;

  @ManyToOne(() => BetOrder, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order?: BetOrder | null;

  @Column({
    name: 'entry_key',
    type: 'varchar',
    length: 128,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  entryKey: string;

  @Column({ name: 'entry_type', type: 'varchar', length: 20 })
  entryType: LedgerEntryType;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  amount: string;

  @Column({
    name: 'reserved_delta',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  reservedDelta: string;

  @Column({
    name: 'available_after',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  availableAfter: string;

  @Column({
    name: 'reserved_after',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  reservedAfter: string;

  @Column({ type: 'char', length: 3 })
  currency: string;

  /** Version du compte produite par cette écriture : ordre total, jamais deux fois la même. */
  @Column({
    name: 'account_version',
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string | number) => Number(v),
    },
  })
  accountVersion: number;

  @Column({ name: 'actor_user_id', type: 'char', length: 36, nullable: true })
  actorUserId: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;
}
