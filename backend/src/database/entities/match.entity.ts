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

  @Column({ type: 'varchar', length: 255, nullable: true })
  leagueLogo: string | null;

  @Column({ type: 'int', nullable: true })
  countryId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  countryName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  countryLogo: string | null;

  @Column({ type: 'int', nullable: true })
  homeTeamId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  homeName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  homeTeamBadge: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  homeFormation: string | null;

  @Column({ type: 'int', nullable: true })
  awayTeamId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  awayName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  awayTeamBadge: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  awayFormation: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  matchDate: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  matchTime: string | null;

  @Column({ type: 'datetime', nullable: true })
  eventDate: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  scoreHome: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  scoreAway: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  halfTimeScoreHome: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  halfTimeScoreAway: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  extraTimeScoreHome: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  extraTimeScoreAway: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  penaltyScoreHome: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  penaltyScoreAway: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  ftScoreHome: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  ftScoreAway: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  status: string | null;

  @Column({ type: 'tinyint', default: 0 })
  isLive: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  round: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  stageId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  stageName: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  stadium: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  referee: string | null;

  @Column({ type: 'json', nullable: true })
  raw: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
