'use client';

import { LeagueGroup } from '../../components/league-group/LeagueGroup';
import { SystemStatusPill } from '../../components/system-status-pill/SystemStatusPill';
import { SyncButton } from '../../components/sync-button/SyncButton';
import { Loader, SkeletonList } from '../../components/loader/Loader';
import { useHealth } from '../../lib/hooks/useHealth';
import { useLiveFixtures } from '../../lib/hooks/useLiveFixtures';
import { useCountdown } from '../../lib/hooks/useCountdown';
import { useChangedScores } from '../../lib/hooks/useChangedScores';
import { useUiControlsStore, REFRESH_INTERVAL_OPTIONS } from '../../lib/state/uiControls';
import { useMemo, useState } from 'react';
import type { LiveFixture } from '../../lib/types/live';

type StatusFilter = 'all' | 'live' | 'upcoming' | 'finished';

// statusShort normalisés (api-sports) + anciens formats apifootball bruts encore en cache
const STATUS_GROUPS: Record<Exclude<StatusFilter, 'all'>, Set<string>> = {
  live:     new Set(['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE', 'INT']),
  upcoming: new Set(['NS', 'TBD', '']),  // '' = apifootball "Not Started" non normalisé
  finished: new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'ABD', 'CANC', 'SUSP', 'PST',
                     'Cancelled', 'Postponed', 'Abandoned', 'Awarded', 'Suspended']),
};

// Teste si un statusShort représente un match en cours (y compris les minutes brutes "75")
function isLiveStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  if (STATUS_GROUPS.live.has(s)) return true;
  return /^\d+(\+\d+)?$/.test(s); // "75", "45+2", etc.
}

const FILTER_EMPTY_LABELS: Record<StatusFilter, string> = {
  all:      'Aucun match disponible.',
  live:     'Aucun match en direct pour le moment.',
  upcoming: 'Aucun match à venir dans cette sélection.',
  finished: 'Aucun match terminé dans cette sélection.',
};

const heroTitle = 'Un dashboard live pour décider vite';

export default function LivePage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('live');
  const { liveRefreshIntervalMs, setLiveRefreshInterval } = useUiControlsStore();
  const { data: health } = useHealth();
  // limit:100 = max autorisé par le backend (défaut 20) — on veut TOUS les matchs en cours
  const { data, isLoading, isFetching, error, dataUpdatedAt } = useLiveFixtures({
    limit: 100,
    sortBy: 'matchDate',
    sortOrder: 'ASC',
  });
  const fixtures = data?.items ?? [];
  const changedScoreIds = useChangedScores(fixtures);
  const { setActiveFixture } = useUiControlsStore();

  const nextRefreshAt = dataUpdatedAt + liveRefreshIntervalMs;
  const secondsToRefresh = useCountdown(nextRefreshAt);

  const updatedAtLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  const counts = useMemo<Record<StatusFilter, number>>(() => ({
    all:      fixtures.length,
    live:     fixtures.filter((f) => isLiveStatus(f.statusShort)).length,
    upcoming: fixtures.filter((f) => STATUS_GROUPS.upcoming.has(f.statusShort ?? '')).length,
    finished: fixtures.filter((f) => STATUS_GROUPS.finished.has(f.statusShort ?? '')).length,
  }), [fixtures]);

  const filteredFixtures = useMemo<LiveFixture[]>(() => {
    if (statusFilter === 'all') return fixtures;
    if (statusFilter === 'live') return fixtures.filter((f) => isLiveStatus(f.statusShort));
    return fixtures.filter((f) => STATUS_GROUPS[statusFilter].has(f.statusShort ?? ''));
  }, [fixtures, statusFilter]);

  const leagueGroups = useMemo(() => {
    const map = new Map<number, { leagueName: string; fixtures: LiveFixture[] }>();
    for (const f of filteredFixtures) {
      const key = f.leagueId ?? 0;
      if (!map.has(key)) {
        map.set(key, {
          leagueName: f.leagueName ?? `Championnat ${key}`,
          fixtures: [],
        });
      }
      map.get(key)!.fixtures.push(f);
    }
    return [...map.values()].sort((a, b) => b.fixtures.length - a.fixtures.length);
  }, [filteredFixtures]);

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
          Suivez les matchs en temps réel et lancez une analyse dès qu&apos;un signal se déclenche.
        </p>
        <SystemStatusPill status={status} message={statusMessage} />
      </div>

      <div className="live-section">
        <div className="live-section-header">
          <div>
            <p className="eyebrow">En direct</p>
            <h2 className="live-section-title">
              Matchs live
              {filteredFixtures.length > 0 && (
                <span className="live-count">{filteredFixtures.length}</span>
              )}
            </h2>
          </div>

          <div className="live-refresh-bar">
            {isFetching && !isLoading && (
              <span className="live-spinner" aria-label="Mise à jour en cours" />
            )}
            {updatedAtLabel && (
              <span className="live-updated-at">
                Mis à jour {updatedAtLabel}
              </span>
            )}
            {!isFetching && dataUpdatedAt > 0 && liveRefreshIntervalMs > 0 && (
              <span className="live-countdown">
                ↻ {secondsToRefresh}s
              </span>
            )}
            {liveRefreshIntervalMs === 0 && (
              <span className="live-manual-badge">Manuel</span>
            )}

            <div className="live-interval-group">
              <label className="live-interval-label" htmlFor="live-interval">
                Refresh
              </label>
              <select
                id="live-interval"
                className="live-interval-select"
                value={liveRefreshIntervalMs}
                onChange={(e) => setLiveRefreshInterval(Number(e.target.value))}
              >
                {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <SyncButton />
          </div>
        </div>

        <div className="status-filter-bar">
          {([
            { id: 'all',      label: 'Tous' },
            { id: 'live',     label: '● En direct' },
            { id: 'upcoming', label: 'À venir' },
            { id: 'finished', label: 'Terminés' },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={[
                'status-pill',
                statusFilter === id ? 'active' : '',
                id === 'live' ? 'status-pill--live' : '',
              ].join(' ').trim()}
              onClick={() => setStatusFilter(id)}
            >
              {label}
              {counts[id] > 0 && (
                <span className="status-pill-count">{counts[id]}</span>
              )}
            </button>
          ))}
        </div>

        {isLoading && <SkeletonList count={6} />}
        {error && <p className="tab-text">Impossible de charger les données.</p>}

        {!isLoading && !error && filteredFixtures.length === 0 && (
          <div className="live-empty">
            <p>{FILTER_EMPTY_LABELS[statusFilter]}</p>
            {statusFilter === 'live' && (
              <small>Lance une synchronisation ou attends le prochain refresh automatique.</small>
            )}
          </div>
        )}

        {leagueGroups.length > 0 && (
          <div className="live-groups">
            {leagueGroups.map((group) => (
              <LeagueGroup
                key={group.leagueName}
                leagueName={group.leagueName}
                fixtures={group.fixtures}
                onAnalyze={setActiveFixture}
                changedScoreIds={changedScoreIds}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
