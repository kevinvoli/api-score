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

@Entity('fixture_lineups')
@Index('idx_fixture_lineups_fixture_id', ['fixtureId'])
export class FixtureLineup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  fixtureId: string;

  @ManyToOne(() => Fixture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixtureId' })
  fixture: Fixture;

  @Column({ type: 'int', nullable: true })
  teamId: number | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  formation: string | null;

  @Column({ type: 'json', nullable: true })
  coach: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  startXi: Record<string, unknown>[] | null;

  @Column({ type: 'json', nullable: true })
  substitutes: Record<string, unknown>[] | null;

  @Column({ type: 'json' })
  raw: Record<string, unknown>;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  snapshotAt: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}

