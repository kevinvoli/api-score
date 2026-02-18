import styles from './RecommendationCard.module.css';

export type RecommendationCardProps = {
  recommendation: {
    id: string;
    marketType: string;
    fixtureId: string;
    selection: string;
    currentOdd: number;
    minAcceptableOdd: number;
    edgePct: number;
    confidenceScore: number;
    reasons: string[];
    riskFlags: string[];
    status: 'NEW' | 'ACTIVE' | 'REJECTED';
  };
  onAddCoupon?: (id: string) => void;
};

const badgeColor = (status: RecommendationCardProps['recommendation']['status']) => {
  switch (status) {
    case 'ACTIVE':
      return styles.badgeActive;
    case 'REJECTED':
      return styles.badgeRejected;
    default:
      return styles.badgeNew;
  }
};

export function RecommendationCard({ recommendation, onAddCoupon }: RecommendationCardProps) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div>
          <p className={styles.tag}>{recommendation.marketType}</p>
          <h3>{recommendation.selection}</h3>
        </div>
        <span className={`${styles.status} ${badgeColor(recommendation.status)}`}>
          {recommendation.status}
        </span>
      </header>

      <section className={styles.metrics}>
        <div>
          <p>Edge</p>
          <strong>{recommendation.edgePct.toFixed(1)}%</strong>
        </div>
        <div>
          <p>Confidence</p>
          <strong>{recommendation.confidenceScore}</strong>
        </div>
        <div>
          <p>Odd</p>
          <strong>{recommendation.currentOdd.toFixed(2)}</strong>
          <span className={styles.minOdd}>min {recommendation.minAcceptableOdd.toFixed(2)}</span>
        </div>
      </section>

      <ul className={styles.details}>
        {recommendation.reasons.slice(0, 3).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <div className={styles.footer}>
        <div className={styles.risks}>
          {recommendation.riskFlags.map((flag) => (
            <span key={flag} className={styles.risk}>
              {flag}
            </span>
          ))}
        </div>
        <button
          className={styles.cta}
          type="button"
          onClick={() => onAddCoupon?.(recommendation.id)}
        >
          Ajouter coupon
        </button>
      </div>
    </article>
  );
}
