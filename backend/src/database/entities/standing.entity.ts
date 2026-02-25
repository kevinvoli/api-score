import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('standings')
@Index('idx_standings_league_team', ['leagueId', 'teamKey'], { unique: true })
@Index('idx_standings_league_id', ['leagueId'])
export class Standing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  leagueId: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  season: string | null;

  @Column({ type: 'int' })
  teamKey: number;

  @Column({ type: 'varchar', length: 120 })
  teamName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  teamBadge: string | null;

  @Column({ type: 'int', default: 0 })
  standingPlace: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  standingPlaceType: string | null;

  @Column({ type: 'int', default: 0 })
  played: number;

  @Column({ type: 'int', default: 0 })
  won: number;

  @Column({ type: 'int', default: 0 })
  drawn: number;

  @Column({ type: 'int', default: 0 })
  lost: number;

  @Column({ type: 'int', default: 0 })
  goalsFor: number;

  @Column({ type: 'int', default: 0 })
  goalsAgainst: number;

  @Column({ type: 'int', default: 0 })
  goalDiff: number;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ type: 'int', nullable: true })
  homeWon: number | null;

  @Column({ type: 'int', nullable: true })
  homeDrawn: number | null;

  @Column({ type: 'int', nullable: true })
  homeLost: number | null;

  @Column({ type: 'int', nullable: true })
  homeGF: number | null;

  @Column({ type: 'int', nullable: true })
  homeGA: number | null;

  @Column({ type: 'int', nullable: true })
  homePoints: number | null;

  @Column({ type: 'int', nullable: true })
  awayWon: number | null;

  @Column({ type: 'int', nullable: true })
  awayDrawn: number | null;

  @Column({ type: 'int', nullable: true })
  awayLost: number | null;

  @Column({ type: 'int', nullable: true })
  awayGF: number | null;

  @Column({ type: 'int', nullable: true })
  awayGA: number | null;

  @Column({ type: 'int', nullable: true })
  awayPoints: number | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
