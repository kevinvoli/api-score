import type { RiskLimitsView } from '../../lib/types/execution';
import { fmtMoney } from './format';
import styles from './execution.module.css';

export interface RiskLimitsPanelProps {
  limits: RiskLimitsView | null | undefined;
  /** Contrôle injoignable : les limites affichées pourraient ne plus être celles en vigueur. */
  stale: boolean;
}

/** Plafonds de la politique active, en lecture seule : aucune règle de risque n'est évaluée ici. */
export function RiskLimitsPanel({ limits, stale }: RiskLimitsPanelProps) {
  return (
    <section className={styles.panel} aria-label="Politique de risque">
      <h3 className={styles.panelTitle}>Politique de risque active</h3>
      {stale && <p className={styles.warning}>Backend injoignable : dernières limites connues, non confirmées.</p>}
      {!limits ? (
        <p className={styles.hint}>Aucune politique active : aucune réservation n’est possible.</p>
      ) : (
        <dl className={styles.facts}>
          <div>
            <dt>Version</dt>
            <dd>v{limits.version}</dd>
          </div>
          <div>
            <dt>Mise max. par pari</dt>
            <dd>{fmtMoney(limits.maxStakePerBet, limits.currency)}</dd>
          </div>
          <div>
            <dt>Budget du jour</dt>
            <dd>{fmtMoney(limits.maxDailyStake, limits.currency)}</dd>
          </div>
          <div>
            <dt>Perte max. du jour</dt>
            <dd>{fmtMoney(limits.maxDailyLoss, limits.currency)}</dd>
          </div>
          <div>
            <dt>Exposition max.</dt>
            <dd>{fmtMoney(limits.maxOpenExposure, limits.currency)}</dd>
          </div>
          <div>
            <dt>Âge max. de cote</dt>
            <dd>{Math.round(limits.maxQuoteAgeMs / 1000)} s</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
