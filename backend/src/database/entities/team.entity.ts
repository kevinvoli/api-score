import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('teams')
@Index('idx_teams_team_key', ['teamKey'], { unique: true })
@Index('idx_teams_league_id', ['leagueId'])
export class Team {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  teamKey: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  country: string | null;

  @Column({ type: 'int', nullable: true })
  founded: number | null;

  @Column({ type: 'boolean', nullable: true })
  national: boolean | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  badge: string | null;

  @Column({ type: 'int', nullable: true })
  venueId: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  venueName: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  venueAddress: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  venueCity: string | null;

  @Column({ type: 'int', nullable: true })
  venueCapacity: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  venueSurface: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  venueImage: string | null;

  @Column({ type: 'json', nullable: true })
  venue: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  leagueId: number | null;

  @Column({ type: 'json', nullable: true })
  raw: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
