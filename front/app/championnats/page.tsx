'use client';

import { useMemo, useState } from 'react';
import { useProviderExplorer } from '../../lib/providerExplorerContext';
import { useProviderMatches, useProviderStandings, useSyncProvider } from '../../lib/hooks/useProviderData';
import { Loader, SkeletonList } from '../../components/loader/Loader';

type Tab = 'matches' | 'standings' | 'teams';

export default function ChampionnatsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('matches');

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
  const standingsQuery = useProviderStandings(selectedLeagueId ?? undefined);
  const { sync, isSyncing } = useSyncProvider({
    countryId: selectedCountryId ?? undefined,
    leagueId: selectedLeagueId ?? undefined,
  });
  const matches = matchesQuery.data ?? [];
  const standings = standingsQuery.data ?? [];
  const matchesError = matchesQuery.error;

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

  const groupedMatches = useMemo(() => {
    const groups: Record<string, typeof sortedMatches> = {};
    for (const m of sortedMatches) {
      const key = m.match_date ?? (m.event_date ? new Date(m.event_date).toLocaleDateString('fr-FR') : 'Date inconnue');
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    return groups;
  }, [sortedMatches]);

  return (
    <section className="content">
      <div className="hero">
        <p className="eyebrow">Championnats</p>
        <h1>Explorer les compétitions</h1>
        <p className="lead">Sélectionne un pays et un championnat pour explorer les données.</p>
      </div>

      {/* ── Sélecteurs ── */}
      <div className="champ-selectors">
        <div className="champ-select-group">
          <label className="champ-select-label" htmlFor="sel-country">Pays</label>
          {countriesLoading ? (
            <Loader size={18} centered />
          ) : (
            <select
              id="sel-country"
              className="champ-select"
              value={selectedCountryId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedCountryId(v ? Number(v) : null);
                setSelectedLeagueId(null);
                setActiveTab('matches');
              }}
            >
              <option value="">— Choisir un pays —</option>
              {countries.map((c) => (
                <option key={c.country_id} value={c.country_id}>
                  {c.country_name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="champ-select-group">
          <label className="champ-select-label" htmlFor="sel-league">Championnat</label>
          {leaguesLoading ? (
            <Loader size={18} centered />
          ) : (
            <select
              id="sel-league"
              className="champ-select"
              value={selectedLeagueId ?? ''}
              disabled={!selectedCountryId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedLeagueId(v ? Number(v) : null);
                setActiveTab('matches');
              }}
            >
              <option value="">— Choisir un championnat —</option>
              {leagues.map((l) => (
                <option key={l.league_id} value={l.league_id}>
                  {l.league_name}{l.season ? ` · ${l.season}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Bouton sync */}
        <button
          type="button"
          className="champ-sync-btn"
          onClick={sync}
          disabled={isSyncing}
          title="Recharger depuis l'API externe"
        >
          {isSyncing ? <Loader size={14} /> : '↻'}
          {isSyncing ? 'Sync...' : 'Rafraîchir'}
        </button>

        {/* Info sélection */}
        {selectedLeague && (
          <div className="champ-sel-info">
            {selectedLeague.league_logo && (
              <img src={selectedLeague.league_logo} alt="" className="champ-league-logo" />
            )}
            <div>
              <strong>{selectedLeague.league_name}</strong>
              {selectedLeague.season && <small className="champ-sel-season">{selectedLeague.season}</small>}
              {selectedCountry && (
                <small className="champ-sel-country">{selectedCountry.country_name}</small>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      {selectedLeagueId && (
        <>
          <div className="champ-tabs">
            {(['matches', 'standings', 'teams'] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`champ-tab${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'matches'
                  ? `Matchs${matches.length ? ` (${matches.length})` : ''}`
                  : tab === 'standings'
                  ? `Classement${standings.length ? ` (${standings.length})` : ''}`
                  : `Équipes${teams.length ? ` (${teams.length})` : ''}`}
              </button>
            ))}
          </div>

          {/* ── TAB: Matchs ── */}
          {activeTab === 'matches' && (
            <div className="champ-tab-body">
              {matchesQuery.isLoading && (
                <div className="champ-loading-state">
                  <Loader size={20} centered />
                  <p className="champ-loading-label">Récupération des matchs depuis l&apos;API…</p>
                </div>
              )}
              {!matchesQuery.isLoading && matchesError && (
                <div className="champ-error-state">
                  <p className="champ-error-title">Impossible de charger les matchs</p>
                  <p className="champ-error-hint">Vérifie la connexion au backend ou le quota API, puis clique sur Rafraîchir.</p>
                  <button type="button" className="champ-sync-btn" onClick={sync} disabled={isSyncing}>
                    {isSyncing ? <Loader size={14} /> : '↻'} Réessayer
                  </button>
                </div>
              )}
              {!matchesQuery.isLoading && !matchesError && !matches.length && (
                <div className="champ-empty-state">
                  <p className="champ-empty">Aucun match trouvé pour ce championnat.</p>
                  <p className="champ-empty" style={{ fontSize: '0.8rem' }}>
                    Les données peuvent ne pas être disponibles pour la saison en cours. Essaie de rafraîchir.
                  </p>
                  <button type="button" className="champ-sync-btn" onClick={sync} disabled={isSyncing} style={{ marginTop: '8px' }}>
                    {isSyncing ? <Loader size={14} /> : '↻'} Rafraîchir depuis l&apos;API
                  </button>
                </div>
              )}
              {!matchesQuery.isLoading && Object.entries(groupedMatches).map(([date, dayMatches]) => (
                <div key={date} className="champ-day-group">
                  <p className="champ-day-label">{date}</p>
                  {dayMatches.map((match) => {
                    const id = match.fixture_id ?? match.match_id ?? `${match.match_hometeam_name}-${match.match_awayteam_name}`;
                    const score = match.match_hometeam_score != null && match.match_awayteam_score != null
                      ? `${match.match_hometeam_score} - ${match.match_awayteam_score}`
                      : null;
                    return (
                      <div key={id} className="champ-match-row">
                        <div className="champ-match-time">
                          {match.match_time ?? (match.event_date
                            ? new Date(match.event_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                            : '—')}
                        </div>

                        <div className="champ-match-teams">
                          <div className="champ-team home">
                            {match.team_home_badge && (
                              <img src={match.team_home_badge} alt="" className="champ-badge" />
                            )}
                            <span>{match.match_hometeam_name ?? '—'}</span>
                          </div>

                          <div className="champ-score-block">
                            {score ? (
                              <span className="champ-score">{score}</span>
                            ) : (
                              <span className="champ-score-sep">vs</span>
                            )}
                            {match.match_live == 1 || match.match_live === '1' ? (
                              <span className="champ-live-dot">EN DIRECT</span>
                            ) : null}
                          </div>

                          <div className="champ-team away">
                            <span>{match.match_awayteam_name ?? '—'}</span>
                            {match.team_away_badge && (
                              <img src={match.team_away_badge} alt="" className="champ-badge" />
                            )}
                          </div>
                        </div>

                        <div className="champ-match-meta">
                          {match.match_round ? <span>J{match.match_round}</span> : null}
                          {match.match_status ? <span className="champ-status">{match.match_status}</span> : null}
                          {match.match_stadium ? <span className="champ-stadium">{match.match_stadium}</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── TAB: Classement ── */}
          {activeTab === 'standings' && (
            <div className="champ-tab-body">
              {standingsQuery.isLoading && <SkeletonList count={10} />}
              {!standingsQuery.isLoading && !standings.length && (
                <p className="champ-empty">Classement non disponible pour ce championnat.</p>
              )}
              {!standingsQuery.isLoading && standings.length > 0 && (
                <div className="champ-standings">
                  <div className="champ-standings-header">
                    <span className="col-rank">#</span>
                    <span className="col-team">Équipe</span>
                    <span className="col-num">J</span>
                    <span className="col-num">V</span>
                    <span className="col-num">N</span>
                    <span className="col-num">D</span>
                    <span className="col-num">BP</span>
                    <span className="col-num">BC</span>
                    <span className="col-num">Diff</span>
                    <span className="col-pts">Pts</span>
                  </div>
                  {standings.map((s) => (
                    <div
                      key={s.teamKey}
                      className={`champ-standing-row${s.standingPlaceType ? ' has-badge' : ''}`}
                    >
                      <span className="col-rank">{s.standingPlace}</span>
                      <span className="col-team">
                        {s.teamBadge && <img src={s.teamBadge} alt="" className="champ-badge champ-badge--sm" />}
                        <span className="champ-team-name">{s.teamName}</span>
                        {s.standingPlaceType && (
                          <span className="champ-place-type">{s.standingPlaceType}</span>
                        )}
                      </span>
                      <span className="col-num">{s.played}</span>
                      <span className="col-num">{s.won}</span>
                      <span className="col-num">{s.drawn}</span>
                      <span className="col-num">{s.lost}</span>
                      <span className="col-num">{s.goalsFor}</span>
                      <span className="col-num">{s.goalsAgainst}</span>
                      <span className={`col-num ${s.goalDiff > 0 ? 'pos' : s.goalDiff < 0 ? 'neg' : ''}`}>
                        {s.goalDiff > 0 ? `+${s.goalDiff}` : s.goalDiff}
                      </span>
                      <span className="col-pts">{s.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: Équipes ── */}
          {activeTab === 'teams' && (
            <div className="champ-tab-body">
              {teamsLoading && <SkeletonList count={6} />}
              {!teamsLoading && teams.length === 0 && (
                <p className="champ-empty">Aucune équipe disponible pour ce championnat.</p>
              )}
              <div className="team-grid">
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
        </>
      )}

      {!selectedLeagueId && !selectedCountryId && (
        <p className="champ-empty champ-empty--center">
          Sélectionne un pays pour commencer.
        </p>
      )}
      {!selectedLeagueId && selectedCountryId && !leaguesLoading && (
        <p className="champ-empty champ-empty--center">
          Sélectionne un championnat pour voir les données.
        </p>
      )}
    </section>
  );
}
