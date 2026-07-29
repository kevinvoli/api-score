import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('league_watchlist')
@Index('idx_league_watchlist_league_id', ['leagueId'], { unique: true })
export class LeagueWatchlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  leagueId: number;

  @Column({ type: 'varchar', length: 160 })
  leagueName: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  countryName: string | null;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
