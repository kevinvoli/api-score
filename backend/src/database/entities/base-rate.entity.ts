import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const decimalTransformer = {
  to: (value: number) => value,
  from: (value: string | number | null) =>
    value === null ? null : Number(value),
};

/**
 * Taux de base observé sur l'historique : « parmi les équipes-matchs qui, au
 * moment de décision, présentaient un `signal` ≥ `threshold`, quelle fraction a
 * réalisé l'événement `market` ? ». Une ligne par (championnat, saison, marché,
 * signal, seuil). Remplace les `confidenceScore` inventés (LOT 2).
 */
@Entity('base_rates')
@Index(
  'idx_base_rates_key',
  ['leagueId', 'season', 'market', 'signal', 'threshold'],
  { unique: true },
)
@Index('idx_base_rates_league_season', ['leagueId', 'season'])
export class BaseRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  leagueId: number;

  @Column({ type: 'int' })
  season: number;

  /** Événement observé : 'goal_1h' | 'goal_2h' | 'goal_ft'. */
  @Column({ type: 'varchar', length: 40 })
  market: string;

  /**
   * Signal évalué : 'total_shots' | 'on_target' | 'pressure_index'.
   * Colonne `signal_type` : `signal` est un mot réservé MariaDB (casse tout SQL brut).
   */
  @Column({ type: 'varchar', length: 40, name: 'signal_type' })
  signal: string;

  @Column({ type: 'int' })
  threshold: number;

  /** Nombre d'équipes-matchs satisfaisant `signal >= threshold`. */
  @Column({ type: 'int' })
  sampleSize: number;

  /** Fraction [0..1] de `sampleSize` ayant réalisé l'événement. */
  @Column({
    type: 'decimal',
    precision: 6,
    scale: 4,
    transformer: decimalTransformer,
  })
  observedRate: number;

  @UpdateDateColumn({ type: 'datetime' })
  calculatedAt: Date;
}
