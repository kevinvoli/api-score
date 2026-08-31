import type { LiveFixture } from '../../lib/types/live';
import styles from './MatchRow.module.css';

type Props = {
  fixture: LiveFixture;
  scoreChanged?: boolean;
  onAnalyze?: () => void;
};

const LIVE_STATUSES = new Set(['1H', '2H', 'ET', 'P', 'LIVE', 'INT', 'BT']);
const HT_STATUSES  = new Set(['HT', 'BT']);
const FT_STATUSES  = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'ABD']);

function StatusCell({ statusShort, elapsed, matchDate, isStale }: {
  statusShort: string | null;
  elapsed: number | null;
  matchDate: string | null;
  isStale?: boolean;
}) {
  const s = statusShort ?? '';

  // Statut live mais données jamais re-synchronisées (sync interrompue avant
  // la fin du match) : afficher la minute qui « tourne » serait mensonger.
  if (isStale && (LIVE_STATUSES.has(s) || HT_STATUSES.has(s))) {
    return (
      <div className={styles.statusTime} title="Données non synchronisées depuis la fin du suivi">
        Figé
      </div>
    );
  }

  if (LIVE_STATUSES.has(s)) {
    return (
      <div className={styles.statusLive}>
        <span className={styles.dot} />
        <span className={styles.statusText}>{elapsed != null ? `${elapsed}'` : 'LIVE'}</span>
      </div>
    );
  }
  if (HT_STATUSES.has(s)) {
    return (
      <div className={styles.statusHt}>
        <span className={styles.dotHt} />
        <span className={styles.statusText}>MT</span>
      </div>
    );
  }
  if (FT_STATUSES.has(s)) {
    return <div className={styles.statusFt}>FT</div>;
  }
  if (matchDate) {
    const d = new Date(matchDate);
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return <div className={styles.statusTime}>{time}</div>;
  }
  return <div className={styles.statusTime}>{s || '—'}</div>;
}

function Badge({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className={styles.badge}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

export function MatchRow({ fixture, scoreChanged = false, onAnalyze }: Props) {
  const home = fixture.homeTeamName ?? 'Domicile';
  const away = fixture.awayTeamName ?? 'Extérieur';
  const hasScore = fixture.scoreHome != null && fixture.scoreAway != null;

  return (
    <div className={styles.row} role="row">
      {/* Colonne statut */}
      <StatusCell
        statusShort={fixture.statusShort}
        elapsed={fixture.elapsed}
        matchDate={fixture.matchDate}
        isStale={fixture.isStale}
      />

      {/* Colonne match : [équipe dom] [score] [équipe ext] */}
      <div className={styles.match}>
        <div className={styles.teamHome}>
          <span className={styles.teamName} title={home}>{home}</span>
          {fixture.homeTeamBadge && <Badge src={fixture.homeTeamBadge} alt={home} />}
        </div>

        <div className={styles.scoreWrap}>
          <span
            className={`${styles.score} ${scoreChanged ? styles.scoreFlash : ''}`}
            key={scoreChanged ? 'changed' : 'stable'}
          >
            {hasScore ? `${fixture.scoreHome} - ${fixture.scoreAway}` : 'vs'}
          </span>
        </div>

        <div className={styles.teamAway}>
          {fixture.awayTeamBadge && <Badge src={fixture.awayTeamBadge} alt={away} />}
          <span className={styles.teamName} title={away}>{away}</span>
        </div>
      </div>

      {/* Colonne cotes */}
      <div className={styles.odds}>
        <button type="button" className={styles.oddBtn} disabled>
          <span className={styles.oddLabel}>1</span>
          <span className={styles.oddVal}>—</span>
        </button>
        <button type="button" className={styles.oddBtn} disabled>
          <span className={styles.oddLabel}>X</span>
          <span className={styles.oddVal}>—</span>
        </button>
        <button type="button" className={styles.oddBtn} disabled>
          <span className={styles.oddLabel}>2</span>
          <span className={styles.oddVal}>—</span>
        </button>
      </div>

      {/* Bouton analyser */}
      <button
        type="button"
        className={styles.analyzeBtn}
        onClick={onAnalyze}
        title="Analyser ce match"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
