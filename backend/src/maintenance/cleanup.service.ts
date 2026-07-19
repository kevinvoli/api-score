import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThan, Repository } from 'typeorm';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { SmartCoupon } from '../database/entities/smart-coupon.entity';
import { JsonLogger } from '../common/json.logger';

@Injectable()
export class CleanupService {
  constructor(
    private readonly logger: JsonLogger,
    @InjectRepository(ApiFootballPayload)
    private readonly payloadRepository: Repository<ApiFootballPayload>,
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
    @InjectRepository(BetRecommendation)
    private readonly recommendationRepository: Repository<BetRecommendation>,
    @InjectRepository(SmartCoupon)
    private readonly couponRepository: Repository<SmartCoupon>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldData(): Promise<void> {
    const retentionDays = 90;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const payloadResult = await this.payloadRepository.delete({
      fetchedAt: LessThan(cutoff),
    });

    const fixturesResult = await this.fixtureRepository.delete({
      matchDate: LessThan(cutoff),
    });

    this.logger.log(
      {
        event: 'cleanup_completed',
        retentionDays,
        payloadsDeleted: payloadResult.affected ?? 0,
        fixturesDeleted: fixturesResult.affected ?? 0,
      },
      'CleanupService',
    );
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
