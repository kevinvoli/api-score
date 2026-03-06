import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SmartCouponStatus = 'PENDING' | 'WON' | 'LOST';

@Entity('smart_coupons')
@Index('idx_smart_coupons_fixture_team_market', ['fixtureId', 'teamId', 'marketType'])
@Index('idx_smart_coupons_status', ['status'])
export class SmartCoupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Référence vers la fixture (fixtures.id, UUID) */
  @Column({ type: 'varchar', length: 36 })
  fixtureId: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  homeTeamName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  awayTeamName: string | null;

  /** ID de l'équipe concernée par la suggestion */
  @Column({ type: 'int', nullable: true })
  teamId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  teamName: string | null;

  /** true = domicile, false = extérieur */
  @Column({ type: 'tinyint', default: 0 })
  isHomeTeam: boolean;

  /** "Buts 1ère mi-temps" | "Buts match" | "Buts 2ème mi-temps" */
  @Column({ type: 'varchar', length: 80 })
  marketType: string;

  @Column({ type: 'varchar', length: 255 })
  selection: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  currentOdd: number | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  minAcceptableOdd: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  edgePct: number | null;

  @Column({ type: 'int', nullable: true })
  confidenceScore: number | null;

  @Column({ type: 'json', nullable: true })
  reasons: string[] | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ruleName: string | null;

  /** Temps de jeu (en minutes) au moment où la suggestion a été générée */
  @Column({ type: 'int', nullable: true })
  elapsedAtSuggestion: number | null;

  @Column({ type: 'int', nullable: true })
  shotsCount: number | null;

  /**
   * PENDING → en attente de résolution
   * WON     → la prédiction s'est réalisée
   * LOST    → la prédiction a échoué
   */
  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: SmartCouponStatus;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
