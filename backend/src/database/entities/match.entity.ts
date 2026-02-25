import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('matches')
@Index('idx_matches_fixture_id', ['fixtureId'], { unique: true })
@Index('idx_matches_league_id', ['leagueId'])
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  fixtureId: number;

  @Column({ type: 'int', nullable: true })
  leagueId: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  leagueName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  homeName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  awayName: string | null;

  @Column({ type: 'datetime', nullable: true })
  eventDate: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  status: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  round: string | null;

  @Column({ type: 'json', nullable: true })
  raw: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
