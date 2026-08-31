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

@Entity('fixture_player_stats_snapshots')
@Index('idx_fixture_player_stats_fixture_id', ['fixtureId'])
@Index('idx_fixture_player_stats_snapshot_at', ['snapshotAt'])
export class FixturePlayerStatsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  fixtureId: string;

  @ManyToOne(() => Fixture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixtureId' })
  fixture: Fixture;

  @Column({ type: 'int', nullable: true })
  teamId: number | null;

  @Column({ type: 'int', nullable: true })
  playerId: number | null;

  @Column({ type: 'json' })
  stats: Record<string, unknown>;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  snapshotAt: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
