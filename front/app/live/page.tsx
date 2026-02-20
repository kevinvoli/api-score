'use client';

import { MatchCardLive } from '../../components/match-card-live/MatchCardLive';
import { SystemStatusPill } from '../../components/system-status-pill/SystemStatusPill';
import { useHealth } from '../../lib/hooks/useHealth';
import { useLiveFixtures } from '../../lib/hooks/useLiveFixtures';
import { useFixtureSummary } from '../../lib/hooks/useFixtureSummary';
import { useUiControlsStore } from '../../lib/state/uiControls';
import { getTeamName } from '../../lib/utils/fixture';

const heroTitle = 'Un dashboard live pour dÃ©cider vite';

export default function LivePage() {
  const { data: health } = useHealth();
  const { data, isLoading, error } = useLiveFixtures();
  const fixture = data?.items?.[0];
  const { data: summary } = useFixtureSummary(fixture?.providerFixtureId);
  const { setActiveFixture } = useUiControlsStore();

  const status =
    health?.status === 'ok' ? 'Healthy' : health?.status === 'degraded' ? 'Degraded' : 'Degraded';
  const statusMessage =
    health?.status === 'ok'
      ? 'API live disponible'
      : health?.status === 'degraded'
      ? 'API partiellement disponible'
      : 'API indisponible';

  return (
    <section className="content">
      <div className="hero">
        <p className="eyebrow">Live</p>
        <h1>{heroTitle}</h1>
        <p className="lead">
          Suivez les matchs en temps rÃ©el et lancez une analyse dÃ¨s quâ€™un signal se dÃ©clenche.
        </p>
        <SystemStatusPill status={status} message={statusMessage} />
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
          momentum={summary?.momentum ?? { homePressureIndex: 0, awayPressureIndex: 0, dominantSide: 'balanced' }}
          confidence={summary?.confidence ?? fixture.confidence ?? 0}
          dataQualityFlags={summary?.dataQuality?.flags ?? []}
          riskFlags={fixture.raw?.riskFlags ?? []}
          onAnalyze={() => setActiveFixture(String(fixture.providerFixtureId))}
        />
      ) : (
        !isLoading && <p>Aucun match live trouvÃ©.</p>
      )}
    </section>
  );
}
