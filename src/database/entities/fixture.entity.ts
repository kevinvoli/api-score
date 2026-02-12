import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FixtureEvent } from './fixture-event.entity';
import { FixtureStatsSnapshot } from './fixture-stats-snapshot.entity';

@Entity('fixtures')
@Index('idx_fixtures_provider_fixture_id', ['providerFixtureId'], { unique: true })
@Index('idx_fixtures_last_synced_at', ['lastSyncedAt'])
export class Fixture {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint' })
  providerFixtureId: string;

  @Column({ type: 'int', nullable: true })
  leagueId: number | null;

  @Column({ type: 'int', nullable: true })
  season: number | null;

  @Column({ type: 'int', nullable: true })
  homeTeamId: number | null;

  @Column({ type: 'int', nullable: true })
  awayTeamId: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  statusShort: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  statusLong: string | null;

  @Column({ type: 'int', nullable: true })
  elapsed: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  matchDate: Date | null;

  @Column({ type: 'int', nullable: true })
  scoreHome: number | null;

  @Column({ type: 'int', nullable: true })
  scoreAway: number | null;

  @Column({ type: 'jsonb' })
  raw: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastSyncedAt: Date;

  @OneToMany(() => FixtureEvent, (event) => event.fixture)
  events: FixtureEvent[];

  @OneToMany(() => FixtureStatsSnapshot, (snapshot) => snapshot.fixture)
  statsSnapshots: FixtureStatsSnapshot[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
