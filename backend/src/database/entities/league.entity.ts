import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('leagues')
@Index('idx_league_league_id', ['leagueId'], { unique: true })
export class League {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  leagueId: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'int', nullable: true })
  countryId: number | null;

  @Column({ type: 'int', nullable: true })
  season: number | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
