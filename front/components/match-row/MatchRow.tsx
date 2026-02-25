import type { LiveFixture } from '../../lib/types/live';
import styles from './MatchRow.module.css';

type Props = {
  fixture: LiveFixture;
  scoreChanged?: boolean;
  onAnalyze?: () => void;
};

const LIVE_STATUSES = new Set(['1H', '2H', 'ET', 'P', 'LIVE', 'INT', 'BT']);
const HT_STATUSES = new Set(['HT', 'BT']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'ABD']);

function StatusCell({ statusShort, elapsed, matchDate }: {
  statusShort: string | null;
  elapsed: number | null;
  matchDate: string | null;
}) {
  const s = statusShort ?? '';

  if (LIVE_STATUSES.has(s)) {
    return (
      <div className={styles.statusLive}>
        <span className={styles.dot} />
        <span>{elapsed != null ? `${elapsed}'` : 'LIVE'}</span>
      </div>
    );
  }

  if (HT_STATUSES.has(s)) {
    return (
      <div className={styles.statusHt}>
        <span className={styles.dotHt} />
        <span>MT</span>
      </div>
    );
  }

  if (FINISHED_STATUSES.has(s)) {
    return <div className={styles.statusFt}>FT</div>;
  }

  if (matchDate) {
    const d = new Date(matchDate);
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return <div className={styles.statusTime}>{time}</div>;
  }

  return <div className={styles.statusTime}>{s || '—'}</div>;
}

export function MatchRow({ fixture, scoreChanged = false, onAnalyze }: Props) {
  const home = fixture.homeTeamName ?? 'Domicile';
  const away = fixture.awayTeamName ?? 'Extérieur';
  const hasScore =
    fixture.scoreHome != null && fixture.scoreAway != null;

  return (
    <div className={styles.row} role="row">
      <StatusCell
        statusShort={fixture.statusShort}
        elapsed={fixture.elapsed}
        matchDate={fixture.matchDate}
      />

      <div className={styles.match}>
        <span className={styles.team} title={home}>{home}</span>
        <span
          className={`${styles.score} ${scoreChanged ? styles.scoreFlash : ''}`}
          key={scoreChanged ? 'changed' : 'stable'}
        >
          {hasScore ? `${fixture.scoreHome} - ${fixture.scoreAway}` : '-'}
        </span>
        <span className={`${styles.team} ${styles.teamAway}`} title={away}>{away}</span>
      </div>

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

      <button
        type="button"
        className={styles.analyzeBtn}
        onClick={onAnalyze}
        title="Analyser ce match"
      >
        Analyser
      </button>
    </div>
  );
}
