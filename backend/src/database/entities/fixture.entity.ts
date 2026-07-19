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
@Index('idx_fixtures_provider_fixture_id', ['providerFixtureId'], {
  unique: true,
})
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

  @Column({ type: 'varchar', length: 120, nullable: true })
  homeTeamName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  awayTeamName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  homeTeamBadge: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  awayTeamBadge: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  leagueName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  statusShort: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  statusLong: string | null;

  @Column({ type: 'int', nullable: true })
  elapsed: number | null;

  @Column({ type: 'datetime', nullable: true })
  matchDate: Date | null;

  @Column({ type: 'int', nullable: true })
  scoreHome: number | null;

  @Column({ type: 'int', nullable: true })
  scoreAway: number | null;

  @Column({ type: 'json' })
  raw: Record<string, unknown>;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  lastSyncedAt: Date;

  @OneToMany(() => FixtureEvent, (event) => event.fixture)
  events: FixtureEvent[];

  @OneToMany(() => FixtureStatsSnapshot, (snapshot) => snapshot.fixture)
  statsSnapshots: FixtureStatsSnapshot[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
