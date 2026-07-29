'use client';

import { RecommendationCard } from '../../components/recommendation-card/RecommendationCard';
import { useLiveFixtures } from '../../lib/hooks/useLiveFixtures';
import { useLiveRecommendations } from '../../lib/hooks/useLiveRecommendations';
import { useCouponBuilderStore } from '../../lib/state/couponBuilder';
import { getTeamName } from '../../lib/utils/fixture';
import { Loader, SkeletonCard } from '../../components/loader/Loader';

export default function RecommendationsPage() {
  const { data: fixturesData } = useLiveFixtures();
  const { data, isLoading, error } = useLiveRecommendations();
  const recommendations = data?.items ?? [];
  const { addSelection } = useCouponBuilderStore();
  const fixtures = fixturesData?.items ?? [];

  return (
    <section className="recommendations">
      <div className="hero">
        <p className="eyebrow">Recommandations</p>
        <h1>Priorité du moment</h1>
        <p className="lead">
          Découvrez les recommandations live les plus intéressantes et ajoutez-les directement dans votre coupon.
        </p>
      </div>

      <div className="rec-list">
        {isLoading && (
          <>
            <SkeletonCard rows={3} />
            <SkeletonCard rows={3} />
            <SkeletonCard rows={3} />
          </>
        )}
        {error && <p>Impossible de charger les recommandations (API).</p>}
        {!isLoading && !recommendations.length && <p>Aucune recommandation disponible.</p>}
        {!isLoading &&
          recommendations.map((recommendation) => {
            const fixture = fixtures.find((item) => item.id === recommendation.fixtureId);
            const fixtureLabel = fixture
              ? `${getTeamName(fixture, 'home')} vs ${getTeamName(fixture, 'away')}`
              : 'Match non trouvé';

            return (
              <RecommendationCard
                key={recommendation.id}
                recommendation={{
                  ...recommendation,
                  status: recommendation.status ?? 'ACTIVE'
                }}
                fixtureLabel={fixtureLabel}
                onAddCoupon={() =>
                  addSelection({
                    id: recommendation.id,
                    selection: recommendation.selection,
                    fixtureLabel,
                    odd: recommendation.currentOdd,
                    confidenceScore: recommendation.confidenceScore,
                    baseRateSampleSize: recommendation.baseRateSampleSize,
                    edge: recommendation.edgePct,
                    riskFlags: recommendation.riskFlags
                  })
                }
              />
            );
          })}
      </div>
    </section>
  );
}
