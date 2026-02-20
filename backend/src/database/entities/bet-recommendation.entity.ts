import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Fixture } from './fixture.entity';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string | number | null) =>
    value === null ? null : Number(value),
};

@Entity('bet_recommendations')
@Index('idx_bet_recommendations_fixture_id', ['fixtureId'])
@Index('idx_bet_recommendations_status', ['status'])
export class BetRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36 })
  fixtureId: string;

  @ManyToOne(() => Fixture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixtureId' })
  fixture?: Fixture;

  @Column({ type: 'varchar', length: 120 })
  marketType: string;

  @Column({ type: 'varchar', length: 160 })
  selection: string;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 3,
    transformer: decimalTransformer,
  })
  currentOdd: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 3,
    transformer: decimalTransformer,
  })
  minAcceptableOdd: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: decimalTransformer,
  })
  edgePct: number;

  @Column({ type: 'int' })
  confidenceScore: number;

  @Column({ type: 'json' })
  reasons: string[];

  @Column({ type: 'json' })
  riskFlags: string[];

  @Column({ type: 'varchar', length: 20, default: 'NEW' })
  status: 'NEW' | 'ACTIVE' | 'REJECTED';

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
