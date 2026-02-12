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

@Entity('fixture_stats_snapshots')
@Index('idx_fixture_stats_snapshot_fixture_id', ['fixtureId'])
@Index('idx_fixture_stats_snapshot_snapshot_at', ['snapshotAt'])
export class FixtureStatsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  fixtureId: string;

  @ManyToOne(() => Fixture, (fixture) => fixture.statsSnapshots, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fixtureId' })
  fixture: Fixture;

  @Column({ type: 'int', nullable: true })
  teamId: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  half: string | null;

  @Column({ type: 'int', nullable: true })
  elapsed: number | null;

  @Column({ type: 'json' })
  stats: Record<string, unknown>;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  snapshotAt: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}

