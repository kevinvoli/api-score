'use client';

import { MatchCardLive } from '../../components/match-card-live/MatchCardLive';
import { SystemStatusPill } from '../../components/system-status-pill/SystemStatusPill';
import { useHealth } from '../../lib/hooks/useHealth';
import { useLiveFixtures } from '../../lib/hooks/useLiveFixtures';
import { useFixtureSummary } from '../../lib/hooks/useFixtureSummary';
import { useUiControlsStore } from '../../lib/state/uiControls';
import { getTeamName } from '../../lib/utils/fixture';
import { useMemo, useState } from 'react';
import { useProviderExplorer } from '../../lib/providerExplorerContext';
import { useProviderMatches } from '../../lib/hooks/useProviderData';

const heroTitle = 'Un dashboard live pour décider vite';
const tabs = ['Calendrier', 'Matchs', 'Classement', 'Statistiques'] as const;

type Tab = (typeof tabs)[number];

export default function LivePage() {
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0]);
  const { data: health } = useHealth();
  const { data, isLoading, error } = useLiveFixtures();
  const fixture = data?.items?.[0];
  const { data: summary } = useFixtureSummary(fixture?.providerFixtureId);
  const { setActiveFixture } = useUiControlsStore();
  const {
    selectedCountryId,
    selectedLeagueId,
    countries,
    leagues,
    countriesLoading,
    teams,
    teamsLoading,
  } = useProviderExplorer();

  const matchesQuery = useProviderMatches(selectedLeagueId ?? undefined);
  const matches = matchesQuery.data ?? [];

  const status =
    health?.status === 'ok' ? 'Healthy' : health?.status === 'degraded' ? 'Degraded' : 'Degraded';
  const statusMessage =
    health?.status === 'ok'
      ? 'API live disponible'
      : health?.status === 'degraded'
      ? 'API partiellement disponible'
      : 'API indisponible';

  const selectedCountryName = useMemo(
    () => countries.find((country) => country.country_id === selectedCountryId)?.country_name,
    [countries, selectedCountryId],
  );
  const selectedLeagueName = useMemo(
    () => leagues.find((league) => league.league_id === selectedLeagueId)?.league_name,
    [leagues, selectedLeagueId],
  );

  const upcomingMatches = useMemo(() => {
    return [...matches]
      .sort((a, b) => {
        const aDate = a.event_date ? new Date(a.event_date).getTime() : Infinity;
        const bDate = b.event_date ? new Date(b.event_date).getTime() : Infinity;
        return aDate - bDate;
      })
      .slice(0, 5);
  }, [matches]);

  const renderMatchList = () => {
    if (!selectedLeagueId) {
      return <p className="tab-text">Choisis un championnat pour explorer les matchs.</p>;
    }

    if (matchesQuery.isLoading) {
      return <p className="tab-text">Chargement des matchs...</p>;
    }

    if (!matches.length) {
      return <p className="tab-text">Aucun match trouvé pour cette compétition.</p>;
    }

    return (
      <div className="match-list">
        {matches.map((match) => (
          <article
            key={
              match.fixture_id ??
              `${match.match_hometeam_name}-${match.match_awayteam_name}-${match.event_date}`
            }
            className="match-card"
          >
            <div>
              <strong>
                {match.match_hometeam_name} vs {match.match_awayteam_name}
              </strong>
              <p className="match-meta">
                {match.event_date
                  ? new Date(match.event_date).toLocaleString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: '2-digit',
                      month: 'short',
                    })
                  : 'Date inconnue'}
                {match.match_round ? ` · Journée ${match.match_round}` : ''}
              </p>
            </div>
            <span className="match-status">{match.match_status ?? 'Statut inconnu'}</span>
          </article>
        ))}
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Calendrier':
        if (!selectedLeagueId) {
          return <p className="tab-text">Sélectionne un championnat pour voir le calendrier.</p>;
        }
        if (!upcomingMatches.length) {
          return <p className="tab-text">Aucun match planifié pour ce championnat.</p>;
        }
        return (
          <div className="calendar-grid">
            {upcomingMatches.map((match) => (
              <article
                key={match.fixture_id ?? match.event_date}
                className="calendar-card"
              >
                <p className="eyebrow">Calendrier</p>
                <strong>
                  {match.match_hometeam_name} vs {match.match_awayteam_name}
                </strong>
                <p className="match-meta">
                  {match.event_date
                    ? new Date(match.event_date).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Date inconnue'}
                </p>
                <span className="match-status">{match.match_status ?? 'Statut inconnu'}</span>
              </article>
            ))}
          </div>
        );
      case 'Matchs':
        return renderMatchList();
      case 'Classement':
        return <p className="tab-text">Projection du classement par équipe.</p>;
      case 'Statistiques':
        return <p className="tab-text">KPIs dynamiques et mesures avancées.</p>;
      default:
        return null;
    }
  };

  return (
    <section className="content">
      <div className="hero">
        <p className="eyebrow">Live</p>
        <h1>{heroTitle}</h1>
        <p className="lead">
          Suivez les matchs en temps réel et lancez une analyse dès qu'un signal se déclenche.
        </p>
        <SystemStatusPill status={status} message={statusMessage} />
      </div>

      {isLoading && <p>Chargement des fixtures...</p>}
      {error && <p>Impossible de charger les données en ce moment.</p>}
      {fixture ? (
        <MatchCardLive
          fixture={{
            ...fixture,
            homeTeamName: getTeamName(fixture, 'home'),
            awayTeamName: getTeamName(fixture, 'away'),
          }}
          momentum={
            summary?.momentum ?? { homePressureIndex: 0, awayPressureIndex: 0, dominantSide: 'balanced' }
          }
          confidence={summary?.confidence ?? fixture.confidence ?? 0}
          dataQualityFlags={summary?.dataQuality?.flags ?? []}
          riskFlags={fixture.raw?.riskFlags ?? []}
          onAnalyze={() => setActiveFixture(String(fixture.providerFixtureId))}
        />
      ) : (
        !isLoading && <p>Aucun match live trouvé.</p>
      )}

      <header className="section-header">
        <div>
          <p className="eyebrow">Championnat & statistiques</p>
          <h2>{selectedLeagueName ?? 'Sélectionnez un championnat'}</h2>
          <p className="lead">
            {selectedCountryName
              ? `Pays : ${selectedCountryName}`
              : countriesLoading
              ? 'Chargement des pays...'
              : 'Sélectionne un pays depuis la barre latérale.'}
          </p>
        </div>
        <div className="tab-bar">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`tab-button${activeTab === tab ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      <div className="tab-content">{renderTabContent()}</div>

      <div className="team-list">
        <div className="team-list-header">
          <div>
            <p className="eyebrow">Équipes</p>
            <strong>{selectedLeagueName ?? 'Choisis un championnat'}</strong>
          </div>
          <span className="team-list-meta">
            {teams.length ? `${teams.length} équipes` : 'Aucune équipe'}
          </span>
        </div>
        <div className="team-grid">
          {teamsLoading && selectedLeagueId && <p>Chargement des équipes...</p>}
          {!teamsLoading && teams.length === 0 && selectedLeagueId && (
            <p className="tab-text">Aucune équipe disponible pour ce championnat.</p>
          )}
          {teams.map((team) => (
            <div key={team.team_key} className="team-card">
              {team.team_logo && <img src={team.team_logo} alt="" className="team-logo" />}
              <div>
                <p>{team.team_name}</p>
                <small>{team.country ?? 'Pays inconnu'}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
