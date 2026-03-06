'use client';

import { useEffect, useState } from 'react';
import { useUiControlsStore } from '../../lib/state/uiControls';
import { useFixtureDetail } from '../../lib/hooks/useFixtureDetail';
import type { FixtureEvent, FixtureStatsSnapshot } from '../../lib/types/fixture-detail';
import { Loader } from '../loader/Loader';
import styles from './FixtureDetailPanel.module.css';

type Tab = 'resume' | 'events' | 'stats';

// ── Event helpers ────────────────────────────────────────────
const EVENT_ICON: Record<string, string> = {
  Goal:         '⚽',
  'Yellow Card': '🟨',
  'Red Card':    '🟥',
  subst:         '🔄',
  Substitution:  '🔄',
  Var:           '📺',
};

function eventIcon(type: string | null): string {
  if (!type) return '•';
  return EVENT_ICON[type] ?? '•';
}

// ── Confidence gauge ─────────────────────────────────────────
function ConfidenceGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const color =
    pct >= 70 ? 'var(--color-success)' :
    pct >= 40 ? 'var(--color-warning)' :
                'var(--color-error)';
  return (
    <div className={styles.gauge}>
      <div className={styles.gaugeLabel}>
        Confiance
        <strong style={{ color }}>{pct}%</strong>
      </div>
      <div className={styles.gaugeTrack}>
        <div className={styles.gaugeFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Momentum bar ─────────────────────────────────────────────
function MomentumBar({
  home, away, dominantSide,
}: { home: number; away: number; dominantSide: string }) {
  const total = home + away || 1;
  const homePct = Math.round((home / total) * 100);
  return (
    <div className={styles.momentum}>
      <div className={styles.momentumLabels}>
        <span>Domicile</span>
        <span className={styles.momentumTitle}>Momentum</span>
        <span>Extérieur</span>
      </div>
      <div className={styles.momentumTrack}>
        <div className={styles.momentumHome} style={{ width: `${homePct}%` }} />
        <div className={styles.momentumAway} style={{ width: `${100 - homePct}%` }} />
      </div>
      <div className={styles.momentumLabels}>
        <span className={dominantSide === 'home' ? styles.dominant : ''}>{home.toFixed(0)}</span>
        <span />
        <span className={dominantSide === 'away' ? styles.dominant : ''}>{away.toFixed(0)}</span>
      </div>
    </div>
  );
}

// ── Stats helpers ─────────────────────────────────────────────
type StatEntry = { label: string; home: unknown; away: unknown };

function extractStats(
  home: Record<string, unknown> | undefined,
  away: Record<string, unknown> | undefined,
): StatEntry[] {
  if (!home) return [];
  // Format api-sports : { statistics: [{ type, value }, ...] }
  const homeStat = home.statistics;
  const awayStat = away?.statistics;
  if (Array.isArray(homeStat)) {
    return (homeStat as Array<{ type?: string; value?: unknown }>).map((entry) => {
      const awayEntry = Array.isArray(awayStat)
        ? (awayStat as Array<{ type?: string; value?: unknown }>).find((e) => e.type === entry.type)
        : null;
      return { label: entry.type ?? '—', home: entry.value, away: awayEntry?.value ?? null };
    });
  }
  // Format plat : ignorer les valeurs non-primitives (tableaux, objets)
  return Object.entries(home)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .map(([k, v]) => ({ label: k, home: v, away: away?.[k] }));
}

function displayStat(v: unknown): string {
  if (v === null || v === undefined || v === 'null') return '—';
  return String(v);
}

function toStatNum(v: unknown): number {
  if (v === null || v === undefined || v === 'null') return 0;
  const n = Number(String(v).replace('%', ''));
  return Number.isNaN(n) ? 0 : n;
}

// ── Stats row ─────────────────────────────────────────────────
function StatRow({
  label, home, away,
}: { label: string; home: unknown; away: unknown }) {
  const h = toStatNum(home);
  const a = toStatNum(away);
  const total = h + a || 1;
  const homePct = Math.round((h / total) * 100);
  return (
    <div className={styles.statRow}>
      <span className={styles.statVal}>{displayStat(home)}</span>
      <div className={styles.statCenter}>
        <span className={styles.statLabel}>{label}</span>
        <div className={styles.statBar}>
          <div className={styles.statBarHome} style={{ width: `${homePct}%` }} />
        </div>
      </div>
      <span className={`${styles.statVal} ${styles.statValAway}`}>{displayStat(away)}</span>
    </div>
  );
}

// ── Panel content ─────────────────────────────────────────────
function PanelContent({
  fixtureId,
  onClose,
}: {
  fixtureId: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('resume');
  const { detail, summary, isLoading } = useFixtureDetail(fixtureId);

  const fix = detail.data?.fixture;
  const events = detail.data?.events ?? [];
  const latestStats = detail.data?.latestStats ?? [];
  const sum = summary.data;

  const homeStats = latestStats.find((s) => s.teamId === fix?.homeTeamId);
  const awayStats = latestStats.find((s) => s.teamId === fix?.awayTeamId);

  const statEntries = extractStats(homeStats?.stats, awayStats?.stats);

  return (
    <>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.matchHeader}>
          <div className={styles.teamBlock}>
            {fix?.homeTeamBadge && (
              <img src={fix.homeTeamBadge} alt="" className={styles.badge} />
            )}
            <span className={styles.teamName}>{fix?.homeTeamName ?? 'Domicile'}</span>
          </div>

          <div className={styles.scoreBlock}>
            <span className={styles.score}>
              {fix?.scoreHome ?? '-'} - {fix?.scoreAway ?? '-'}
            </span>
            {fix?.statusShort && (
              <span className={styles.statusPill}>
                {fix.statusShort === '1H' || fix.statusShort === '2H'
                  ? `● ${fix.elapsed ?? '?'}'`
                  : fix.statusShort === 'HT'
                  ? 'MT'
                  : fix.statusShort}
              </span>
            )}
          </div>

          <div className={`${styles.teamBlock} ${styles.teamBlockAway}`}>
            <span className={styles.teamName}>{fix?.awayTeamName ?? 'Extérieur'}</span>
            {fix?.awayTeamBadge && (
              <img src={fix.awayTeamBadge} alt="" className={styles.badge} />
            )}
          </div>
        </div>

        {fix?.leagueName && (
          <p className={styles.leagueName}>{fix.leagueName}</p>
        )}

        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className={styles.tabBar}>
        {(['resume', 'events', 'stats'] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tabBtn} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'resume' ? 'Résumé' : tab === 'events' ? `Événements${events.length ? ` (${events.length})` : ''}` : 'Stats'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {isLoading && <Loader size={28} label="Chargement du match…" centered />}

        {!isLoading && activeTab === 'resume' && (
          <div className={styles.tabContent}>
            {sum ? (
              <>
                <ConfidenceGauge value={sum.confidence} />
                <MomentumBar
                  home={sum.momentum.homePressureIndex}
                  away={sum.momentum.awayPressureIndex}
                  dominantSide={sum.momentum.dominantSide}
                />
                {sum.dataQuality.flags.length > 0 && (
                  <div className={styles.flags}>
                    {sum.dataQuality.flags.map((f) => (
                      <span key={f} className={styles.flag}>{f}</span>
                    ))}
                  </div>
                )}
                {sum.recentEvents.length > 0 && (
                  <div className={styles.recentEvents}>
                    <p className={styles.sectionLabel}>Derniers événements</p>
                    {sum.recentEvents.map((e, i) => (
                      <div key={i} className={styles.eventRow}>
                        <span className={styles.eventMinute}>{e.minute ?? '—'}&apos;</span>
                        <span className={styles.eventIcon}>{eventIcon(e.type)}</span>
                        <span className={styles.eventDetail}>{e.detail ?? e.type ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {sum.recentEvents.length === 0 && !sum.dataQuality.hasRecentStats && (
                  <p className={styles.empty}>Données insuffisantes pour ce match.</p>
                )}
              </>
            ) : (
              <p className={styles.empty}>Résumé indisponible.</p>
            )}
          </div>
        )}

        {!isLoading && activeTab === 'events' && (
          <div className={styles.tabContent}>
            {events.length === 0 ? (
              <p className={styles.empty}>Aucun événement enregistré.</p>
            ) : (
              events.map((e) => (
                <div key={e.id} className={styles.eventRow}>
                  <span className={styles.eventMinute}>{e.minute ?? '—'}&apos;</span>
                  <span className={styles.eventIcon}>{eventIcon(e.eventType)}</span>
                  <div className={styles.eventInfo}>
                    <span className={styles.eventDetail}>{e.detail ?? e.eventType ?? '—'}</span>
                    {e.extra != null && (
                      <span className={styles.eventExtra}>+{e.extra}&apos;</span>
                    )}
                  </div>
                  <span className={styles.eventTeam}>
                    {e.teamId === fix?.homeTeamId ? 'DOM' : e.teamId === fix?.awayTeamId ? 'EXT' : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {!isLoading && activeTab === 'stats' && (
          <div className={styles.tabContent}>
            {statEntries.length === 0 ? (
              <p className={styles.empty}>Statistiques indisponibles.</p>
            ) : (
              <>
                <div className={styles.statsHeader}>
                  <span>{fix?.homeTeamName ?? 'DOM'}</span>
                  <span />
                  <span>{fix?.awayTeamName ?? 'EXT'}</span>
                </div>
                {statEntries.map(({ label, home, away }) => (
                  <StatRow key={label} label={label} home={home} away={away} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────
export function FixtureDetailPanel() {
  const { activeFixtureId, setActiveFixture } = useUiControlsStore();
  const isOpen = Boolean(activeFixtureId);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveFixture(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveFixture]);

  return (
    <>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.backdropVisible : ''}`}
        onClick={() => setActiveFixture(null)}
        aria-hidden="true"
      />
      <aside
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}
        aria-label="Détail du match"
      >
        {isOpen && activeFixtureId && (
          <PanelContent
            fixtureId={activeFixtureId}
            onClose={() => setActiveFixture(null)}
          />
        )}
      </aside>
    </>
  );
}
