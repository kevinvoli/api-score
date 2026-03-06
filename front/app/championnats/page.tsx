'use client';

import { useMemo, useState } from 'react';
import { useProviderExplorer } from '../../lib/providerExplorerContext';
import { useProviderMatches, useProviderStandings, useSyncProvider } from '../../lib/hooks/useProviderData';
import { Loader, SkeletonList } from '../../components/loader/Loader';
import type { ProviderMatch } from '../../lib/api/provider';

type Tab        = 'matches' | 'standings' | 'teams';
type DateFilter = 'yesterday' | 'today' | 'tomorrow' | 'all';

const DATE_LABELS: Record<DateFilter, string> = {
  yesterday: 'Hier',
  today:     "Aujourd'hui",
  tomorrow:  'Demain',
  all:       'Toute la saison',
};

function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function matchIsoDate(m: ProviderMatch): string | null {
  if (m.event_date) return m.event_date.slice(0, 10);
  if (m.match_date) {
    const parts = m.match_date.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return m.match_date.slice(0, 10);
  }
  return null;
}

// ── Ligne de match ────────────────────────────────────────────
function MatchRow({ match }: { match: ProviderMatch }) {
  const id    = match.fixture_id ?? match.match_id ?? `${match.match_hometeam_name}-${match.match_awayteam_name}`;
  const score = match.match_hometeam_score != null && match.match_awayteam_score != null
    ? `${match.match_hometeam_score} - ${match.match_awayteam_score}`
    : null;
  const isLive = match.match_live == 1 || match.match_live === '1';

  return (
    <div key={id} className={`champ-match-row${isLive ? ' champ-match-row--live' : ''}`}>
      <div className="champ-match-time">
        {isLive
          ? <span className="champ-live-badge">LIVE</span>
          : match.match_time
            ?? (match.event_date
              ? new Date(match.event_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
              : '—')}
      </div>

      <div className="champ-match-teams">
        <div className="champ-team home">
          {match.team_home_badge && <img src={match.team_home_badge} alt="" className="champ-badge" />}
          <span>{match.match_hometeam_name ?? '—'}</span>
        </div>

        <div className="champ-score-block">
          {score
            ? <span className={`champ-score${isLive ? ' champ-score--live' : ''}`}>{score}</span>
            : <span className="champ-score-sep">vs</span>}
        </div>

        <div className="champ-team away">
          <span>{match.match_awayteam_name ?? '—'}</span>
          {match.team_away_badge && <img src={match.team_away_badge} alt="" className="champ-badge" />}
        </div>
      </div>

      <div className="champ-match-meta">
        {match.match_round   ? <span>J{match.match_round}</span>                    : null}
        {match.match_status  ? <span className="champ-status">{match.match_status}</span>  : null}
        {match.match_stadium ? <span className="champ-stadium">{match.match_stadium}</span> : null}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function ChampionnatsPage() {
  const [activeTab,   setActiveTab]   = useState<Tab>('matches');
  const [dateFilter,  setDateFilter]  = useState<DateFilter>('today');

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

  const matchesQuery   = useProviderMatches(selectedLeagueId ?? undefined);
  const standingsQuery = useProviderStandings(selectedLeagueId ?? undefined);
  const { sync, isSyncing } = useSyncProvider({
    countryId: selectedCountryId ?? undefined,
    leagueId:  selectedLeagueId  ?? undefined,
  });

  const allMatches   = matchesQuery.data ?? [];
  const standings    = standingsQuery.data ?? [];
  const matchesError = matchesQuery.error;

  const selectedCountry = useMemo(
    () => countries.find((c) => c.country_id === selectedCountryId),
    [countries, selectedCountryId],
  );
  const selectedLeague = useMemo(
    () => leagues.find((l) => l.league_id === selectedLeagueId),
    [leagues, selectedLeagueId],
  );

  // Compter les matchs par filtre date (pour les badges)
  const dateCounts = useMemo<Record<DateFilter, number>>(() => {
    const y = offsetDate(-1);
    const t = offsetDate(0);
    const d = offsetDate(1);
    const counts = { yesterday: 0, today: 0, tomorrow: 0, all: allMatches.length };
    for (const m of allMatches) {
      const iso = matchIsoDate(m);
      if (iso === y) counts.yesterday++;
      if (iso === t) counts.today++;
      if (iso === d) counts.tomorrow++;
    }
    return counts;
  }, [allMatches]);

  // Filtrer puis trier : live en tête, puis chronologique
  const filteredMatches = useMemo<ProviderMatch[]>(() => {
    let list = allMatches;
    if (dateFilter !== 'all') {
      const target = dateFilter === 'yesterday' ? offsetDate(-1)
                   : dateFilter === 'today'     ? offsetDate(0)
                   :                              offsetDate(1);
      list = list.filter((m) => matchIsoDate(m) === target);
    }
    // Tri par date DESC : futur → présent → passé récent → passé ancien
    // Matchs sans date poussés en bas
    return [...list].sort((a, b) => {
      const aIso = matchIsoDate(a) ?? '0000-00-00';
      const bIso = matchIsoDate(b) ?? '0000-00-00';
      if (bIso > aIso) return 1;
      if (bIso < aIso) return -1;
      // Même date → heure de la journée, en ordre chronologique (ASC)
      const aTime = a.match_time ?? '00:00';
      const bTime = b.match_time ?? '00:00';
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    });
  }, [allMatches, dateFilter]);

  // Grouper par date (mode "Toute la saison") — filteredMatches déjà trié DESC
  const groupedMatches = useMemo(() => {
    const order: string[] = [];
    const groups: Record<string, ProviderMatch[]> = {};
    for (const m of filteredMatches) {
      const iso = matchIsoDate(m);
      const key = iso
        ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
        : (m.match_date ?? 'Date inconnue');
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(m);
    }
    // Retourner dans l'ordre d'insertion (déjà DESC car filteredMatches l'est)
    return order.map((k) => ({ label: k, matches: groups[k] }));
  }, [filteredMatches]);

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
          {countriesLoading ? <Loader size={18} centered /> : (
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
                <option key={c.country_id} value={c.country_id}>{c.country_name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="champ-select-group">
          <label className="champ-select-label" htmlFor="sel-league">Championnat</label>
          {leaguesLoading ? <Loader size={18} centered /> : (
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

        {selectedLeague && (
          <div className="champ-sel-info">
            {selectedLeague.league_logo && (
              <img src={selectedLeague.league_logo} alt="" className="champ-league-logo" />
            )}
            <div>
              <strong>{selectedLeague.league_name}</strong>
              {selectedLeague.season && <small className="champ-sel-season">{selectedLeague.season}</small>}
              {selectedCountry && <small className="champ-sel-country">{selectedCountry.country_name}</small>}
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
                  ? `Matchs${allMatches.length ? ` (${allMatches.length})` : ''}`
                  : tab === 'standings'
                  ? `Classement${standings.length ? ` (${standings.length})` : ''}`
                  : `Équipes${teams.length ? ` (${teams.length})` : ''}`}
              </button>
            ))}
          </div>

          {/* ── TAB: Matchs ── */}
          {activeTab === 'matches' && (
            <div className="champ-tab-body">

              {/* Filtre par date */}
              {!matchesQuery.isLoading && !matchesError && allMatches.length > 0 && (
                <div className="champ-date-filter">
                  {(['yesterday', 'today', 'tomorrow', 'all'] as DateFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`champ-date-pill${dateFilter === f ? ' active' : ''}`}
                      onClick={() => setDateFilter(f)}
                    >
                      {DATE_LABELS[f]}
                      {f !== 'all' && dateCounts[f] > 0 && (
                        <span className="champ-date-pill-count">{dateCounts[f]}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Chargement */}
              {matchesQuery.isLoading && (
                <div className="champ-loading-state">
                  <Loader size={20} centered />
                  <p className="champ-loading-label">Récupération des matchs depuis l&apos;API…</p>
                </div>
              )}

              {/* Erreur */}
              {!matchesQuery.isLoading && matchesError && (
                <div className="champ-error-state">
                  <p className="champ-error-title">Impossible de charger les matchs</p>
                  <p className="champ-error-hint">Vérifie la connexion au backend ou le quota API.</p>
                  <button type="button" className="champ-sync-btn" onClick={sync} disabled={isSyncing}>
                    {isSyncing ? <Loader size={14} /> : '↻'} Réessayer
                  </button>
                </div>
              )}

              {/* Aucun match saison */}
              {!matchesQuery.isLoading && !matchesError && allMatches.length === 0 && (
                <div className="champ-empty-state">
                  <p className="champ-empty">Aucun match trouvé pour ce championnat.</p>
                  <p className="champ-empty" style={{ fontSize: '0.8rem' }}>
                    Les données peuvent ne pas être disponibles pour la saison en cours.
                  </p>
                  <button type="button" className="champ-sync-btn" onClick={sync} disabled={isSyncing} style={{ marginTop: '8px' }}>
                    {isSyncing ? <Loader size={14} /> : '↻'} Rafraîchir depuis l&apos;API
                  </button>
                </div>
              )}

              {/* Aucun match pour ce filtre */}
              {!matchesQuery.isLoading && !matchesError && allMatches.length > 0 && filteredMatches.length === 0 && (
                <p className="champ-empty champ-empty--center">
                  Aucun match {DATE_LABELS[dateFilter].toLowerCase()} pour ce championnat.
                </p>
              )}

              {/* Liste */}
              {!matchesQuery.isLoading && !matchesError && filteredMatches.length > 0 && (
                dateFilter === 'all'
                  ? groupedMatches.map(({ label, matches: dayMatches }) => (
                      <div key={label} className="champ-day-group">
                        <p className="champ-day-label">{label}</p>
                        {dayMatches.map((m) => <MatchRow key={m.fixture_id ?? m.match_id ?? `${m.match_hometeam_name}-${m.match_awayteam_name}`} match={m} />)}
                      </div>
                    ))
                  : (
                    <div className="champ-day-group">
                      <p className="champ-day-label">
                        {DATE_LABELS[dateFilter]} — {filteredMatches.length} match{filteredMatches.length > 1 ? 's' : ''}
                      </p>
                      {filteredMatches.map((m) => <MatchRow key={m.fixture_id ?? m.match_id ?? `${m.match_hometeam_name}-${m.match_awayteam_name}`} match={m} />)}
                    </div>
                  )
              )}
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
                    <div key={s.teamKey} className={`champ-standing-row${s.standingPlaceType ? ' has-badge' : ''}`}>
                      <span className="col-rank">{s.standingPlace}</span>
                      <span className="col-team">
                        {s.teamBadge && <img src={s.teamBadge} alt="" className="champ-badge champ-badge--sm" />}
                        <span className="champ-team-name">{s.teamName}</span>
                        {s.standingPlaceType && <span className="champ-place-type">{s.standingPlaceType}</span>}
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
                    {team.team_logo && <img src={team.team_logo} alt="" className="team-logo" />}
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
        <p className="champ-empty champ-empty--center">Sélectionne un pays pour commencer.</p>
      )}
      {!selectedLeagueId && selectedCountryId && !leaguesLoading && (
        <p className="champ-empty champ-empty--center">Sélectionne un championnat pour voir les données.</p>
      )}
    </section>
  );
}
