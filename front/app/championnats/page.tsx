'use client';

import { useMemo } from 'react';
import { useProviderExplorer } from '../../lib/providerExplorerContext';
import { useProviderMatches } from '../../lib/hooks/useProviderData';
import { Loader, SkeletonList, SkeletonGrid } from '../../components/loader/Loader';

export default function ChampionnatsPage() {
  const {
    selectedCountryId,
    selectedLeagueId,
    countries,
    leagues,
    countriesLoading,
    leaguesLoading,
    setSelectedCountryId,
    setSelectedLeagueId,
    teams,
    teamsLoading,
  } = useProviderExplorer();

  const matchesQuery = useProviderMatches(selectedLeagueId ?? undefined);
  const matches = matchesQuery.data ?? [];

  const selectedCountry = useMemo(
    () => countries.find((c) => c.country_id === selectedCountryId),
    [countries, selectedCountryId],
  );
  const selectedLeague = useMemo(
    () => leagues.find((l) => l.league_id === selectedLeagueId),
    [leagues, selectedLeagueId],
  );

  const sortedMatches = useMemo(
    () =>
      [...matches].sort((a, b) => {
        const aDate = a.event_date ? new Date(a.event_date).getTime() : Infinity;
        const bDate = b.event_date ? new Date(b.event_date).getTime() : Infinity;
        return aDate - bDate;
      }),
    [matches],
  );

  return (
    <section className="content">
      <div className="hero">
        <p className="eyebrow">Championnats</p>
        <h1>Explorer les compétitions</h1>
        <p className="lead">
          Navigue dans la hiérarchie Pays → Championnat → Matchs pour explorer les données.
        </p>
      </div>

      {/* ── Explorateur hiérarchique 3 colonnes ── */}
      <div className="hier-explorer">

        {/* Colonne 1 : Pays */}
        <div className="hier-col">
          <div className="hier-col-header">
            <p className="eyebrow">Pays</p>
            {selectedCountry && (
              <span className="hier-breadcrumb">{selectedCountry.country_name}</span>
            )}
          </div>
          <div className="hier-col-body">
            {countriesLoading && <Loader size={20} centered />}
            {!countriesLoading && !countries.length && (
              <p className="hier-empty">Aucun pays disponible.</p>
            )}
            {countries.map((country) => (
              <button
                key={country.country_id}
                type="button"
                className={`hier-item${selectedCountryId === country.country_id ? ' active' : ''}`}
                onClick={() => setSelectedCountryId(country.country_id)}
              >
                {country.country_logo && (
                  <img src={country.country_logo} alt="" className="hier-flag" />
                )}
                <span className="hier-item-label">{country.country_name}</span>
                {selectedCountryId === country.country_id && (
                  <span className="hier-arrow">›</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Colonne 2 : Championnats */}
        <div className="hier-col">
          <div className="hier-col-header">
            <p className="eyebrow">Championnats</p>
            {selectedLeague && (
              <span className="hier-breadcrumb">{selectedLeague.league_name}</span>
            )}
          </div>
          <div className="hier-col-body">
            {!selectedCountryId && (
              <p className="hier-empty">← Sélectionne un pays</p>
            )}
            {selectedCountryId && leaguesLoading && <Loader size={20} centered />}
            {selectedCountryId && !leaguesLoading && !leagues.length && (
              <p className="hier-empty">Aucun championnat pour ce pays.</p>
            )}
            {leagues.map((league) => (
              <button
                key={league.league_id}
                type="button"
                className={`hier-item${selectedLeagueId === league.league_id ? ' active' : ''}`}
                onClick={() => setSelectedLeagueId(league.league_id)}
              >
                <span className="hier-item-label">{league.league_name}</span>
                {league.season && (
                  <small className="hier-item-meta">{league.season}</small>
                )}
                {selectedLeagueId === league.league_id && (
                  <span className="hier-arrow">›</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Colonne 3 : Matchs */}
        <div className="hier-col hier-col--wide">
          <div className="hier-col-header">
            <p className="eyebrow">Matchs</p>
            {sortedMatches.length > 0 && (
              <span className="hier-breadcrumb">{sortedMatches.length} matchs</span>
            )}
          </div>
          <div className="hier-col-body">
            {!selectedLeagueId && (
              <p className="hier-empty">← Sélectionne un championnat</p>
            )}
            {selectedLeagueId && matchesQuery.isLoading && <SkeletonList count={6} />}
            {selectedLeagueId && !matchesQuery.isLoading && !matches.length && (
              <p className="hier-empty">Aucun match trouvé.</p>
            )}
            {sortedMatches.map((match) => (
              <div
                key={
                  match.fixture_id ??
                  `${match.match_hometeam_name}-${match.match_awayteam_name}-${match.event_date}`
                }
                className="hier-match-row"
              >
                <div className="hier-match-teams">
                  <span className="hier-match-team">{match.match_hometeam_name ?? '—'}</span>
                  <span className="hier-match-vs">vs</span>
                  <span className="hier-match-team hier-match-team--away">
                    {match.match_awayteam_name ?? '—'}
                  </span>
                </div>
                <div className="hier-match-meta">
                  {match.event_date
                    ? new Date(match.event_date).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Date inconnue'}
                  {match.match_round ? ` · J${match.match_round}` : ''}
                </div>
                {match.match_status && (
                  <span className="hier-match-status">{match.match_status}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Équipes du championnat sélectionné ── */}
      {selectedLeagueId && (
        <div className="team-list">
          <div className="team-list-header">
            <div>
              <p className="eyebrow">Équipes</p>
              <strong>{selectedLeague?.league_name ?? '—'}</strong>
              {selectedCountry && (
                <small style={{ marginLeft: 8, color: 'var(--color-text-secondary)' }}>
                  {selectedCountry.country_name}
                </small>
              )}
            </div>
            <span className="team-list-meta">
              {teamsLoading ? '...' : `${teams.length} équipe${teams.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="team-grid">
            {teamsLoading && <SkeletonGrid count={8} />}
            {!teamsLoading && teams.length === 0 && (
              <p className="tab-text">Aucune équipe disponible pour ce championnat.</p>
            )}
            {teams.map((team) => (
              <div key={team.team_key} className="team-card">
                {team.team_logo && (
                  <img src={team.team_logo} alt="" className="team-logo" />
                )}
                <div>
                  <p>{team.team_name}</p>
                  <small>{team.country ?? selectedCountry?.country_name ?? 'Pays inconnu'}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
