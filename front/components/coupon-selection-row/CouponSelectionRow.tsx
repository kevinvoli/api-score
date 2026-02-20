import styles from './CouponSelectionRow.module.css';

export type CouponSelectionRowProps = {
  selection: string;
  marketType: string;
  fixtureLabel?: string;
  odd: number;
  confidence: number;
  edgePct: number;
  riskFlags: string[];
  correlation: 'low' | 'medium' | 'high';
  onRemove?: () => void;
};

const correlationColor = {
  low: styles.correlationLow,
  medium: styles.correlationMedium,
  high: styles.correlationHigh
};

export function CouponSelectionRow({
  selection,
  marketType,
  fixtureLabel,
  odd,
  confidence,
  edgePct,
  riskFlags,
  correlation,
  onRemove
}: CouponSelectionRowProps) {
  return (
    <div className={styles.row}>
      <div>
        <p className={styles.market}>{marketType}</p>
        <h4>{selection}</h4>
        {fixtureLabel && <p className={styles.fixture}>{fixtureLabel}</p>}
        <div className={styles.meta}>
          <span className={styles.metaItem}>Odds {odd.toFixed(2)}</span>
          <span className={styles.metaItem}>Edge {edgePct.toFixed(1)}%</span>
          <span className={`${styles.correlation} ${correlationColor[correlation]}`}>
            Corrélation {correlation}
          </span>
        </div>
      </div>
      <div className={styles.stats}>
        <p className={styles.confidence}>{confidence}</p>
        <span>Confiance</span>
      </div>
      <div className={styles.actions}>
        {riskFlags.map((flag) => (
          <span key={flag} className={styles.risk}>
            {flag}
          </span>
        ))}
        <button type="button" className={styles.remove} onClick={onRemove}>
          Retirer
        </button>
      </div>
    </div>
  );
}
