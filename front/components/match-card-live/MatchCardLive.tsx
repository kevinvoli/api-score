import styles from './MatchCardLive.module.css';

export type MatchCardLiveProps = {
  fixture: {
    providerFixtureId: string;
    homeTeamName: string;
    awayTeamName: string;
    scoreHome: number;
    scoreAway: number;
    elapsed: number;
    statusShort: string;
  };
  momentum: {
    homePressureIndex: number;
    awayPressureIndex: number;
    dominantSide: 'home' | 'away' | 'balanced';
  };
  confidence: number;
  dataQualityFlags: string[];
  riskFlags?: string[];
  onAnalyze?: () => void;
};

const momentumLabel = (dominant: MatchCardLiveProps['momentum']['dominantSide']) => {
  if (dominant === 'home') return 'Momentum home';
  if (dominant === 'away') return 'Momentum away';
  return 'Momentum équilibré';
};

const normalizePercent = (value: number, max = 100) =>
  Math.max(0, Math.min(max, Math.round(value)));

export function MatchCardLive({
  fixture,
  momentum,
  confidence,
  dataQualityFlags,
  riskFlags = [],
  onAnalyze,
}: MatchCardLiveProps) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div>
          <p className={styles.mini}>{fixture.statusShort} Â· {fixture.elapsed}â€™</p>
          <h2>
            <span className={styles.teamRow}>{fixture.homeTeamName}</span>
            <span className={styles.score}>{fixture.scoreHome} - {fixture.scoreAway}</span>
            <span className={styles.teamRow}>{fixture.awayTeamName}</span>
          </h2>
        </div>
        <button className={styles.cta} type="button" onClick={onAnalyze}>
          Analyser
        </button>
      </header>

      <section className={styles.row}>
        <div className={styles.momentum}>
          <span className={styles.momentumLabel}>{momentumLabel(momentum.dominantSide)}</span>
          <div className={styles.momentumBar}>
            <div
              className={styles.momentumHome}
              style={{ width: `${normalizePercent(momentum.homePressureIndex)}%` }}
            />
            <div
              className={styles.momentumAway}
              style={{ width: `${normalizePercent(momentum.awayPressureIndex)}%` }}
            />
          </div>
        </div>
        <div className={styles.confidence}>
          <strong>{confidence}</strong> / 100
          <span>Confiance</span>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.badges}>
          {dataQualityFlags.map((flag) => (
            <span key={flag} className={styles.badge}>
              {flag}
            </span>
          ))}
          {riskFlags.map((risk) => (
            <span key={risk} className={styles.badgeRisk}>
              {risk}
            </span>
          ))}
        </div>
        <p className={styles.hint}>Id match: {fixture.providerFixtureId}</p>
      </footer>
    </article>
  );
}
