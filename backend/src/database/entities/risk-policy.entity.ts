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

/** Version immuable des plafonds de risque. Aucune mise à jour : une nouvelle version la remplace. */
@Entity('risk_policies')
@Index('uq_risk_policies_version', ['version'], { unique: true })
export class RiskPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({
    name: 'max_stake_per_bet',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  maxStakePerBet: string;

  @Column({
    name: 'max_daily_stake',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  maxDailyStake: string;

  @Column({
    name: 'max_daily_loss',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  maxDailyLoss: string;

  @Column({
    name: 'max_open_exposure',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalString,
  })
  maxOpenExposure: string;

  @Column({ name: 'max_quote_age_ms', type: 'int' })
  maxQuoteAgeMs: number;

  @Column({
    name: 'created_by_user_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  createdByUserId: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;
}
