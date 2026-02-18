'use client';

import { MatchCardLive } from '../components/match-card-live/MatchCardLive';
import { RecommendationCard } from '../components/recommendation-card/RecommendationCard';
import { SystemStatusPill } from '../components/system-status-pill/SystemStatusPill';
import { useLiveFixtures } from '../lib/hooks/useLiveFixtures';
import { sampleRecommendations } from '../mocks/mockData';

const heroTitle = 'Un dashboard live pour décider vite';

export default function HomePage() {
  const { data, isLoading, error } = useLiveFixtures();
  const fixture = data?.items?.[0];

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Command Center</p>
        <h1>{heroTitle}</h1>
        <p className="lead">
          Suivez les matchs live, comprenez les recommandations et construisez un coupon intelligent sans perdre
          de temps.
        </p>
        <SystemStatusPill status="Healthy" message="API live ready" />
      </section>

      <section className="content">
        {isLoading && <p>Chargement des fixtures...</p>}
        {error && <p>Impossible de charger les données en ce moment.</p>}
        {fixture ? (
          <MatchCardLive
            fixture={{
              ...fixture,
              homeTeamName: fixture.homeTeamName ?? 'Home',
              awayTeamName: fixture.awayTeamName ?? 'Away'
            }}
            momentum={{
              homePressureIndex: 60,
              awayPressureIndex: 44,
              dominantSide: 'home'
            }}
            confidence={fixture.confidence ?? 78}
            dataQualityFlags={['LIVE', 'QUALITY OK']}
            riskFlags={fixture.raw?.riskFlags ?? []}
          />
        ) : (
          !isLoading && <p>Aucun match live trouvé.</p>
        )}
      </section>

      <section className="recommendations">
        <h2>Recommandations sélectionnées</h2>
        <div className="rec-list">
          {sampleRecommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={{
                ...recommendation,
                status: 'ACTIVE'
              }}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
