import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThan, Repository } from 'typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { SmartCoupon } from '../database/entities/smart-coupon.entity';
import { JsonLogger } from '../common/json.logger';

/** Au-delà de ce volume, une suppression est journalisée en warn avant exécution. */
const MASS_DELETION_THRESHOLD = 1000;

@Injectable()
export class CleanupService {
  constructor(
    private readonly logger: JsonLogger,
    private readonly configService: ConfigService,
    @InjectRepository(ApiFootballPayload)
    private readonly payloadRepository: Repository<ApiFootballPayload>,
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
    @InjectRepository(BetRecommendation)
    private readonly recommendationRepository: Repository<BetRecommendation>,
    @InjectRepository(SmartCoupon)
    private readonly couponRepository: Repository<SmartCoupon>,
  ) {}

  /**
   * Deux rétentions distinctes, et c'est délibéré :
   *  - les payloads bruts sont volumineux et réimportables depuis le provider ;
   *  - les fixtures (et par cascade snapshots et événements) sont la matière
   *    première des taux de base et du backtest. Les purger tôt revient à
   *    détruire la valeur analytique du produit — c'est exactement ce qui s'est
   *    produit le 20/07/2026 avec une rétention unique de 90 jours.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldData(): Promise<void> {
    const dataRetentionDays = this.configService.get<number>(
      'DATA_RETENTION_DAYS',
      1095,
    );
    const payloadRetentionDays = this.configService.get<number>(
      'PAYLOAD_RETENTION_DAYS',
      90,
    );

    const payloadsDeleted = await this.deleteWithGuard(
      'api_football_payloads',
      this.payloadRepository,
      { fetchedAt: LessThan(this.cutoff(payloadRetentionDays)) },
    );

    const fixturesDeleted = await this.deleteWithGuard(
      'fixtures',
      this.fixtureRepository,
      { matchDate: LessThan(this.cutoff(dataRetentionDays)) },
    );

    this.logger.log(
      {
        event: 'cleanup_completed',
        dataRetentionDays,
        payloadRetentionDays,
        payloadsDeleted,
        fixturesDeleted,
      },
      'CleanupService',
    );
  }

  private cutoff(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  /**
   * Compte avant de supprimer : une purge massive est le genre d'opération qui
   * passe inaperçue jusqu'à ce qu'on cherche les données disparues.
   */
  private async deleteWithGuard<T extends object>(
    table: string,
    repository: Repository<T>,
    criteria: Parameters<Repository<T>['delete']>[0],
  ): Promise<number> {
    const affected = await repository.count({
      where: criteria as Parameters<Repository<T>['count']>[0]['where'],
    });
    if (affected === 0) return 0;

    if (affected >= MASS_DELETION_THRESHOLD) {
      this.logger.warn(
        { event: 'cleanup_mass_deletion', table, rows: affected },
        'CleanupService',
      );
    }

    const result = await repository.delete(criteria);
    return result.affected ?? 0;
  }

  /**
   * Purge les artefacts de pari attachés à des fixtures mortes : quand la
   * sync s'interrompt avant la fin d'un match, la fixture reste figée en
   * statut live et ses recommandations NEW / coupons PENDING n'expirent
   * jamais — leur issue est devenue inconnaissable, on les supprime plutôt
   * que de les laisser polluer les compteurs (« en cours » perpétuels).
   * Les endpoints filtrent déjà à la lecture ; ce job assainit la base.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeStaleBettingArtifacts(): Promise<void> {
    const staleAfterHours = 24;
    const cutoff = new Date(Date.now() - staleAfterHours * 60 * 60 * 1000);

    const staleFixtures = await this.fixtureRepository.find({
      select: { id: true },
      where: { lastSyncedAt: LessThan(cutoff) },
    });
    if (!staleFixtures.length) return;

    const staleIds = staleFixtures.map((f) => f.id);

    const recommendations = await this.recommendationRepository.delete({
      status: 'NEW',
      fixtureId: In(staleIds),
    });
    const coupons = await this.couponRepository.delete({
      status: 'PENDING',
      fixtureId: In(staleIds),
    });

    if ((recommendations.affected ?? 0) + (coupons.affected ?? 0) > 0) {
      this.logger.log(
        {
          event: 'stale_betting_artifacts_purged',
          staleAfterHours,
          staleFixtures: staleIds.length,
          recommendationsDeleted: recommendations.affected ?? 0,
          couponsDeleted: coupons.affected ?? 0,
        },
        'CleanupService',
      );
    }
  }
}
