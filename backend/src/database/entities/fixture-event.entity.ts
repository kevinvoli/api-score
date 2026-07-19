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

@Entity('fixture_events')
@Index('idx_fixture_events_fixture_id', ['fixtureId'])
export class FixtureEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  fixtureId: string;

  @ManyToOne(() => Fixture, (fixture) => fixture.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fixtureId' })
  fixture: Fixture;

  @Column({ type: 'int', nullable: true })
  teamId: number | null;

  @Column({ type: 'int', nullable: true })
  playerId: number | null;

  @Column({ type: 'int', nullable: true })
  assistPlayerId: number | null;

  @Column({ type: 'int', nullable: true })
  minute: number | null;

  @Column({ type: 'int', nullable: true })
  extra: number | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  eventType: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  detail: string | null;

  @Column({ type: 'json' })
  raw: Record<string, unknown>;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
