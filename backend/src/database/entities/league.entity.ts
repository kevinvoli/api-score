import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ type: 'varchar', length: 20, nullable: true })
  season: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logo: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  countryName: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
