import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BetOrder } from './bet-order.entity';

/** Reçu opérateur expurgé, immuable, 1-1 avec l'ordre. Le hash est unique : un reçu ne sert qu'une fois. */
@Entity('bet_receipts')
@Index('uq_bet_receipts_order', ['orderId'], { unique: true })
@Index('uq_bet_receipts_receipt_hash', ['receiptHash'], { unique: true })
export class BetReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'char', length: 36 })
  orderId: string;

  // ManyToOne + index unique nommé : évite l'index REL_ implicite d'un OneToOne.
  @ManyToOne(() => BetOrder, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order?: BetOrder;

  @Column({
    name: 'receipt_hash',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
  })
  receiptHash: string;

  @Column({ name: 'redacted_payload', type: 'json' })
  redactedPayload: unknown;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;
}
