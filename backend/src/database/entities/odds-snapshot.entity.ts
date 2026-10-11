import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Fixture } from './fixture.entity';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string | number | null) =>
    value === null ? null : Number(value),
};

@Entity('odds_snapshots')
@Index('idx_odds_snapshots_fixture_id', ['fixtureId'])
@Index('idx_odds_snapshots_captured_at', ['capturedAt'])
@Index('idx_odds_snapshots_fixture_market_captured', [
  'fixtureId',
  'marketType',
  'capturedAt',
])
// Mene par providerFixtureId : la selection filtre par egalite/IN sur la fixture puis par plage
// de reception ; un index mene par provider_key (jamais filtre par egalite) forcait un scan complet.
@Index('idx_odds_snapshots_executable_lookup', [
  'providerFixtureId',
  'receivedAt',
])
export class OddsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 36 })
  fixtureId: string;

  @ManyToOne(() => Fixture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixtureId' })
  fixture?: Fixture;

  @Column({ type: 'bigint' })
  providerFixtureId: string;

  @Column({ name: 'provider_key', type: 'varchar', length: 40, nullable: true })
  providerKey: string | null;

  // Nullable : apifootball ne fournit qu'un nom de bookmaker, jamais d'id numérique.
  @Column({ type: 'int', nullable: true })
  bookmakerId: number | null;

  @Column({ type: 'varchar', length: 120 })
  bookmakerName: string;

  @Column({
    name: 'bookmaker_key',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  bookmakerKey: string | null;

  @Column({ type: 'varchar', length: 60 })
  marketType: string;

  @Column({ name: 'market_key', type: 'varchar', length: 80, nullable: true })
  marketKey: string | null;

  @Column({ type: 'varchar', length: 40 })
  outcome: string;

  @Column({
    name: 'selection_key',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  selectionKey: string | null;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 3,
    transformer: decimalTransformer,
  })
  oddValue: number;

  @Column({
    type: 'decimal',
    precision: 7,
    scale: 6,
    transformer: decimalTransformer,
  })
  impliedProbabilityRaw: number;

  // Nullable : NULL pour les marchés non-partition (ex. double chance), où la
  // notion de probabilité "fair" (marge retirée) n'a pas de sens.
  @Column({
    type: 'decimal',
    precision: 7,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  impliedProbabilityFair: number | null;

  // Nullable : idem impliedProbabilityFair, l'overround ne se calcule que sur
  // une partition d'issues mutuellement exclusives et exhaustives.
  @Column({
    type: 'decimal',
    precision: 7,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  overround: number | null;

  @Column({ type: 'varchar', length: 10 })
  phase: 'PREMATCH' | 'LIVE';

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  capturedAt: Date;

  @Column({
    name: 'observed_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  observedAt: Date | null;

  @Column({
    name: 'received_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  receivedAt: Date | null;

  @Column({ type: 'boolean', nullable: true })
  available: boolean | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
