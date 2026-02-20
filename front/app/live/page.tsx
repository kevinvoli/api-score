'use client';

import { MatchCardLive } from '../../components/match-card-live/MatchCardLive';
import { SystemStatusPill } from '../../components/system-status-pill/SystemStatusPill';
import { useLiveFixtures } from '../../lib/hooks/useLiveFixtures';
import { useUiControlsStore } from '../../lib/state/uiControls';
import { getTeamName } from '../../lib/utils/fixture';

const heroTitle = 'Un dashboard live pour dÃ©cider vite';

export default function LivePage() {
  const { data, isLoading, error } = useLiveFixtures();
  const fixture = data?.items?.[0];
  const { setActiveFixture } = useUiControlsStore();

  return (
    <section className="content">
      <div className="hero">
        <p className="eyebrow">Live</p>
        <h1>{heroTitle}</h1>
        <p className="lead">
          Suivez les matchs en temps rÃ©el et lancez une analyse dÃ¨s quâ€™un signal se dÃ©clenche.
        </p>
        <SystemStatusPill status="Healthy" message="API live prÃªte" />
      </div>

      {isLoading && <p>Chargement des fixtures...</p>}
      {error && <p>Impossible de charger les donnÃ©es en ce moment.</p>}
      {fixture ? (
        <MatchCardLive
          fixture={{
            ...fixture,
            homeTeamName: getTeamName(fixture, 'home'),
            awayTeamName: getTeamName(fixture, 'away')
          }}
          momentum={{
            homePressureIndex: 60,
            awayPressureIndex: 44,
            dominantSide: 'home'
          }}
          confidence={fixture.confidence ?? 78}
          dataQualityFlags={['LIVE', 'QUALITÃ‰ OK']}
          riskFlags={fixture.raw?.riskFlags ?? []}
          onAnalyze={() => setActiveFixture(String(fixture.providerFixtureId))}
        />
      ) : (
        !isLoading && <p>Aucun match live trouvÃ©.</p>
      )}
    </section>
  );
}
