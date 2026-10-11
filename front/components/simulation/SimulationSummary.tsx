import type { SimulationSummary as Summary } from '../../lib/types/simulation';
import { fmtMoney, fmtPct } from '../execution/format';
import styles from './simulation.module.css';

/** Durée en ms ; une valeur absente ou non numérique s'affiche « — », jamais « undefined ». */
export const fmtMs = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} ms` : '—';

export interface SimulationSummaryProps {
  summary: Summary | undefined;
  isLoading: boolean;
  isError: boolean;
}

/** Métriques d'un run virtuel, telles que calculées par le backend depuis le journal. */
export function SimulationSummary({ summary, isLoading, isError }: SimulationSummaryProps) {
  if (isError) return <p className={styles.error}>Synthèse illisible.</p>;
  if (isLoading || !summary) return <p className={styles.hint}>Chargement de la synthèse…</p>;
  const c = summary.currency;
  const cards: Array<{ title: string; value: string; detail: string }> = [
    {
      title: 'Capital',
      value: fmtMoney(summary.bankroll.equity, c),
      detail: `initial ${fmtMoney(summary.bankroll.initial, c)} · disponible ${fmtMoney(summary.bankroll.available, c)} · exposé ${fmtMoney(summary.bankroll.openExposure, c)}`,
    },
    {
      title: 'P&L réalisé',
      value: fmtMoney(summary.pnl.realized, c),
      detail: `volume misé ${fmtMoney(summary.pnl.turnover, c)}`,
    },
    {
      title: 'ROI',
      value: fmtPct(summary.roiPct),
      detail: `hit-rate ${fmtPct(summary.hitRatePct)} · drawdown max ${fmtPct(summary.maxDrawdownPct)}`,
    },
    {
      title: 'Décisions',
      value: String(summary.decisions.total),
      detail: `${summary.settled.total} réglées : ${summary.settled.won} gagnées, ${summary.settled.lost} perdues, ${summary.settled.void} annulées, ${summary.settled.noResult} sans résultat`,
    },
    {
      title: 'Couverture de cote',
      value: fmtPct(summary.signals.coveragePct),
      detail: `${summary.signals.withExecutableOdd} signaux sur ${summary.signals.total} avec une cote exécutable`,
    },
    {
      title: 'Exécution',
      value: fmtMs(summary.latency.avgObservedMs),
      detail: `latence configurée ${fmtMs(summary.latency.configuredMs)} · slippage moyen ${fmtPct(summary.avgSlippagePct)}`,
    },
  ];
  const rejections = Object.entries(summary.decisions.rejectionsByCode).sort((a, b) => b[1] - a[1]);

  return (
    <div className={styles.summary}>
      <div className="analytics-grid">
        {cards.map((card) => (
          <div className="analytics-card" key={card.title}>
            <h3>{card.title}</h3>
            <p className="analytics-value">{card.value}</p>
            <span>{card.detail}</span>
          </div>
        ))}
      </div>
      {rejections.length > 0 && (
        <p className={styles.hint}>
          Rejets : {rejections.map(([code, count]) => `${code} ${count}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
