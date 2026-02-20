'use client';

import { useFixtureAnalytics } from '../../lib/hooks/useFixtureAnalytics';
import { useLiveFixtures } from '../../lib/hooks/useLiveFixtures';
import { useUiControlsStore } from '../../lib/state/uiControls';
import { formatPercent, formatValue, getTeamName } from '../../lib/utils/fixture';

export default function AnalyticsPage() {
  const { data } = useLiveFixtures();
  const { activeFixtureId } = useUiControlsStore();

  const normalizedActiveId = activeFixtureId ? String(activeFixtureId) : null;
  const selectedFixture =
    data?.items?.find((item) => String(item.providerFixtureId) === normalizedActiveId) ?? data?.items?.[0];

  const homeName = getTeamName(selectedFixture, 'home');
  const awayName = getTeamName(selectedFixture, 'away');

  const { data: analyticsData } = useFixtureAnalytics(selectedFixture?.id);
  const metrics = analyticsData?.metrics ?? {};

  return (
    <section className="analytics">
      <div className="analytics-header">
        <div>
          <h2>Analyse avancée</h2>
          <p className="coupon-meta">
            {selectedFixture
              ? `${homeName} vs ${awayName}`
              : 'Sélectionnez un match pour voir les analyses'}
          </p>
        </div>
        <div className="analytics-badges">
          <span className="badge-chip">xG</span>
          <span className="badge-chip">Pression</span>
          <span className="badge-chip">Possession</span>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-card">
          <h3>Pression</h3>
          <p className="analytics-value">
            {formatValue(metrics?.pressureIndex?.home)} / {formatValue(metrics?.pressureIndex?.away)}
          </p>
          <span>Indice domicile / extérieur</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Possession</h3>
          <p className="analytics-value">
            {formatPercent(metrics?.possession?.home)} - {formatPercent(metrics?.possession?.away)}
          </p>
          <span>Domicile / extérieur</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Tirs</h3>
          <p className="analytics-value">
            {formatValue(metrics?.shots?.home)} - {formatValue(metrics?.shots?.away)}
          </p>
          <span>Total tirs</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Tirs cadrés</h3>
          <p className="analytics-value">
            {formatValue(metrics?.onTarget?.home)} - {formatValue(metrics?.onTarget?.away)}
          </p>
          <span>On target</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Expected Goals</h3>
          <p className="analytics-value">
            {formatValue(metrics?.expectedGoals?.home)} - {formatValue(metrics?.expectedGoals?.away)}
          </p>
          <span>xG</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Corners</h3>
          <p className="analytics-value">
            {formatValue(metrics?.corners?.home)} - {formatValue(metrics?.corners?.away)}
          </p>
          <span>Corners</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Fautes</h3>
          <p className="analytics-value">
            {formatValue(metrics?.fouls?.home)} - {formatValue(metrics?.fouls?.away)}
          </p>
          <span>Fautes commises</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Cartons</h3>
          <p className="analytics-value">
            {formatValue(metrics?.yellowCards?.home)}J / {formatValue(metrics?.redCards?.home)}R
          </p>
          <span>{homeName}</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Cartons</h3>
          <p className="analytics-value">
            {formatValue(metrics?.yellowCards?.away)}J / {formatValue(metrics?.redCards?.away)}R
          </p>
          <span>{awayName}</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Passes</h3>
          <p className="analytics-value">
            {formatValue(metrics?.passes?.home?.accuracy, '%')} - {formatValue(metrics?.passes?.away?.accuracy, '%')}
          </p>
          <span>Précision</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Attaques</h3>
          <p className="analytics-value">
            {formatValue(metrics?.attacks?.home)} - {formatValue(metrics?.attacks?.away)}
          </p>
          <span>Attaques</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
        <div className="analytics-card">
          <h3>Danger</h3>
          <p className="analytics-value">
            {formatValue(metrics?.dangerousAttacks?.home)} - {formatValue(metrics?.dangerousAttacks?.away)}
          </p>
          <span>Attaques dangereuses</span>
          <span className="analytics-teams">{homeName} vs {awayName}</span>
        </div>
      </div>
    </section>
  );
}
