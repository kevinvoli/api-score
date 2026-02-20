import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('api_football_payloads')
@Index('idx_api_football_payloads_endpoint', ['endpoint'])
@Index('idx_api_football_payloads_match_id', ['matchId'])
@Index('idx_api_football_payloads_league_id', ['leagueId'])
@Index('idx_api_football_payloads_fetched_at', ['fetchedAt'])
export class ApiFootballPayload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ type: 'varchar', length: 80 })
  endpoint: string;

  @Column({ type: 'json' })
  params: Record<string, unknown>;

  @Column({ type: 'json' })
  payload: Record<string, unknown> | unknown[];

  @Column({ type: 'varchar', length: 40, nullable: true })
  matchId: string | null;

  @Column({ type: 'int', nullable: true })
  leagueId: number | null;

  @Column({ type: 'int', nullable: true })
  teamId: number | null;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  fetchedAt: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
