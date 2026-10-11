import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  OrderStatus,
  RejectionCode,
} from '../../execution/execution.types';
import { BankrollAccount } from './bankroll-account.entity';
import { BetDecision } from './bet-decision.entity';

const decimalString = {
  to: (value: string | null) => value,
  from: (value: string | null) => value,
};
const oddTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null ? null : Number(value),
};
const bigintTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
};

/**
 * Un ordre par décision et par clé d'idempotence. La clé est transmise telle quelle à
 * l'opérateur ; un timeout ne la change jamais. `UNKNOWN` bloque tout nouvel essai.
 */
@Entity('bet_orders')
@Index('uq_bet_orders_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('uq_bet_orders_decision', ['decisionId'], { unique: true })
@Index('uq_bet_orders_external_order_id', ['operatorKey', 'externalOrderId'], {
  unique: true,
})
@Index('idx_bet_orders_account_created', ['accountId', 'createdAt', 'id'])
@Index('idx_bet_orders_status_updated', ['status', 'updatedAt'])
export class BetOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'decision_id', type: 'char', length: 36 })
  decisionId: string;

  @ManyToOne(() => BetDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decision_id' })
  decision?: BetDecision;

  @Column({ name: 'account_id', type: 'char', length: 36 })
  accountId: string;

  @ManyToOne(() => BankrollAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account?: BankrollAccount;

  @Column({ type: 'varchar', length: 20 })
  mode: string;

  @Column({ name: 'operator_key', type: 'varchar', length: 40 })
  operatorKey: string;

  @Column({
    name: 'idempotency_key',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  idempotencyKey: string;

  @Column({
    name: 'external_order_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  externalOrderId: string | null;

  @Column({ type: 'varchar', length: 30 })
  status: OrderStatus;

  @Column({
    name: 'rejection_code',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  rejectionCode: RejectionCode | null;

  @Column({
    name: 'status_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  statusReason: string | null;

  @Column({ name: 'fixture_id', type: 'char', length: 36 })
  fixtureId: string;

  @Column({ name: 'provider_fixture_id', type: 'bigint' })
  providerFixtureId: string;

  @Column({ name: 'market_key', type: 'varchar', length: 80 })
  marketKey: string;

  @Column({ name: 'selection_key', type: 'varchar', length: 80 })
  selectionKey: string;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({
    name: 'requested_stake',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  requestedStake: string;

  @Column({
    name: 'requested_odd',
    type: 'decimal',
    precision: 8,
    scale: 3,
    transformer: oddTransformer,
  })
  requestedOdd: number;

  @Column({
    name: 'minimum_odd',
    type: 'decimal',
    precision: 8,
    scale: 3,
    transformer: oddTransformer,
  })
  minimumOdd: number;

  @Column({ name: 'quote_captured_at', type: 'datetime', precision: 3 })
  quoteCapturedAt: Date;

  @Column({
    name: 'accepted_odd',
    type: 'decimal',
    precision: 8,
    scale: 3,
    nullable: true,
    transformer: oddTransformer,
  })
  acceptedOdd: number | null;

  @Column({
    name: 'accepted_stake',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalString,
  })
  acceptedStake: string | null;

  @Column({
    name: 'accepted_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  acceptedAt: Date | null;

  @Column({
    name: 'payout',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalString,
  })
  payout: string | null;

  @Column({
    name: 'submitted_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  submittedAt: Date | null;

  @Column({
    name: 'unknown_since',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  unknownSince: Date | null;

  @Column({
    name: 'settled_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  settledAt: Date | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  version: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Date;
}
