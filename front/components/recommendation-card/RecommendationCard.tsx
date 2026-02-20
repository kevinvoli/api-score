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
  fixtureLabel?: string;
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

const marketLabel = (marketType: string) => {
  const normalized = marketType.toLowerCase();
  if (normalized === 'match winner') return 'Vainqueur du match';
  if (normalized === 'goals over/under') return 'Buts +/−';
  if (normalized === 'both teams to score') return 'Les deux Ã©quipes marquent';
  return marketType;
};

const statusLabel = (status: RecommendationCardProps['recommendation']['status']) => {
  switch (status) {
    case 'ACTIVE':
      return 'Actif';
    case 'REJECTED':
      return 'Rejeté';
    default:
      return 'Nouveau';
  }
};

export function RecommendationCard({
  recommendation,
  fixtureLabel,
  onAddCoupon
}: RecommendationCardProps) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div>
          <p className={styles.tag}>{marketLabel(recommendation.marketType)}</p>
          <h3>{recommendation.selection}</h3>
          {fixtureLabel && <p className={styles.fixture}>{fixtureLabel}</p>}
        </div>
        <span className={`${styles.status} ${badgeColor(recommendation.status)}`}>
          {statusLabel(recommendation.status)}
        </span>
      </header>

      <section className={styles.metrics}>
        <div>
          <p>Avantage</p>
          <strong>{recommendation.edgePct.toFixed(1)}%</strong>
        </div>
        <div>
          <p>Confiance</p>
          <strong>{recommendation.confidenceScore}</strong>
        </div>
        <div>
          <p>Cote</p>
          <strong>{recommendation.currentOdd.toFixed(2)}</strong>
          <span className={styles.minOdd}>cote min {recommendation.minAcceptableOdd.toFixed(2)}</span>
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
