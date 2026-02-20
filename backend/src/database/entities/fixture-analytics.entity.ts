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

@Entity('fixture_analytics')
@Index('idx_fixture_analytics_fixture_id', ['fixtureId'])
@Index('idx_fixture_analytics_computed_at', ['computedAt'])
export class FixtureAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  fixtureId: string;

  @ManyToOne(() => Fixture, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixtureId' })
  fixture?: Fixture;

  @Column({ type: 'json' })
  metrics: Record<string, unknown>;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  computedAt: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
