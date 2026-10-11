import type { DecisionStatus, DecisionView } from '../../lib/types/simulation';
import { fmtDateTime, fmtMoney, fmtOdd, fmtPct } from '../execution/format';
import styles from './simulation.module.css';

const STATUSES: DecisionStatus[] = ['ELIGIBLE', 'ORDER_RESERVED', 'COMPLETED', 'REJECTED'];

export interface DecisionJournalTableProps {
  decisions: DecisionView[];
  isLoading: boolean;
  isError: boolean;
  status: DecisionStatus | null;
  onStatusChange: (status: DecisionStatus | null) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/** Journal des décisions d'un run : chaque signal accepté ou rejeté, avec sa cote et son motif. */
export function DecisionJournalTable(props: DecisionJournalTableProps) {
  return (
    <section className={styles.panel} aria-label="Journal des décisions">
      <div className={styles.row}>
        <h3 className={styles.panelTitle}>Journal des décisions</h3>
        <select
          aria-label="Filtrer par statut"
          className={styles.select}
          value={props.status ?? ''}
          onChange={(event) =>
            props.onStatusChange(event.target.value ? (event.target.value as DecisionStatus) : null)
          }
        >
          <option value="">Tous les statuts</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      {props.isError && <p className={styles.error}>Journal illisible.</p>}
      {props.isLoading && <p className={styles.hint}>Chargement du journal…</p>}
      {!props.isLoading && !props.isError && props.decisions.length === 0 && (
        <p className={styles.hint}>Aucune décision.</p>
      )}
      {props.decisions.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Décidé le</th>
                <th>Marché</th>
                <th>Sélection</th>
                <th>Statut</th>
                <th>Mise</th>
                <th>Cote décision / exécution</th>
                <th>Slippage</th>
                <th>Résultat</th>
                <th>Gain</th>
              </tr>
            </thead>
            <tbody>
              {props.decisions.map((d) => (
                <tr key={d.id}>
                  <td>{fmtDateTime(d.decidedAt)}</td>
                  <td>{d.marketType}</td>
                  <td>{d.selection}</td>
                  <td>
                    {d.status}
                    {d.rejectionCode && <span className={styles.hint}> {d.rejectionCode}</span>}
                  </td>
                  <td>{fmtMoney(d.stake, d.currency)}</td>
                  <td>
                    {fmtOdd(d.decisionOdd)} / {fmtOdd(d.executableOdd)}
                  </td>
                  <td>{fmtPct(d.slippagePct)}</td>
                  <td>{d.outcome ?? '—'}</td>
                  <td>{fmtMoney(d.profit, d.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.hasMore && (
        <div className={styles.row}>
          <button type="button" className={styles.button} disabled={props.loadingMore} onClick={props.onLoadMore}>
            {props.loadingMore ? 'Chargement…' : 'Décisions plus anciennes'}
          </button>
        </div>
      )}
    </section>
  );
}
