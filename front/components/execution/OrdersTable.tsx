import {
  AMBIGUOUS_ORDER_STATUSES,
  ORDER_STATUSES,
  OrderStatus,
  OrderView,
} from '../../lib/types/execution';
import { fmtDateTime, fmtMoney, fmtOdd, shortId } from './format';
import styles from './execution.module.css';

const STATUS_TONE: Record<OrderStatus, 'ok' | 'warn' | 'bad' | undefined> = {
  RESERVED: undefined,
  SUBMITTING: 'warn',
  ACCEPTED: 'ok',
  REJECTED: undefined,
  UNKNOWN: 'bad',
  SETTLED: 'ok',
  VOIDED: undefined,
  RECONCILIATION_REQUIRED: 'bad',
};

export const isAmbiguous = (order: Pick<OrderView, 'status'>): boolean =>
  AMBIGUOUS_ORDER_STATUSES.includes(order.status);

export interface OrdersTableProps {
  orders: OrderView[];
  isLoading: boolean;
  isError: boolean;
  /** Backend injoignable : la liste affichée est la dernière connue. */
  stale: boolean;
  status: OrderStatus | null;
  onStatusChange: (status: OrderStatus | null) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/** Ordres paginés ; un ordre ambigu (UNKNOWN, à rapprocher) est surligné et compté en tête. */
export function OrdersTable(props: OrdersTableProps) {
  const ambiguous = props.orders.filter(isAmbiguous).length;
  return (
    <section className={styles.panel} aria-label="Ordres">
      <div className={styles.row}>
        <h3 className={styles.panelTitle}>Ordres</h3>
        <select
          aria-label="Filtrer par statut"
          className={styles.select}
          value={props.status ?? ''}
          onChange={(event) =>
            props.onStatusChange(event.target.value ? (event.target.value as OrderStatus) : null)
          }
        >
          <option value="">Tous les statuts</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        {ambiguous > 0 && (
          <span className={styles.badge} data-tone="bad">
            {ambiguous} ordre(s) ambigu(s) à rapprocher
          </span>
        )}
      </div>
      {props.isError && props.orders.length === 0 && <p className={styles.error}>Ordres illisibles.</p>}
      {props.stale && <p className={styles.warning}>Backend injoignable : dernière liste connue, non confirmée.</p>}
      {props.isLoading && <p className={styles.hint}>Chargement des ordres…</p>}
      {!props.isLoading && !props.isError && !props.stale && props.orders.length === 0 && (
        <p className={styles.hint}>Aucun ordre.</p>
      )}
      {props.orders.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Créé le</th>
                <th>Statut</th>
                <th>Mode</th>
                <th>Mise</th>
                <th>Cote (demandée / min. / acceptée)</th>
                <th>Gain</th>
                <th>Réf. opérateur</th>
                <th>Reçu</th>
                <th>Rapprochement</th>
              </tr>
            </thead>
            <tbody>
              {props.orders.map((order) => (
                <tr key={order.id} className={isAmbiguous(order) ? styles.ambiguous : undefined}>
                  <td>{fmtDateTime(order.createdAt)}</td>
                  <td>
                    <span className={styles.badge} data-tone={STATUS_TONE[order.status]}>
                      {order.status}
                    </span>
                    {order.rejectionCode && <span className={styles.hint}> {order.rejectionCode}</span>}
                  </td>
                  <td>{order.mode}</td>
                  <td>{fmtMoney(order.acceptedStake ?? order.requestedStake, order.currency)}</td>
                  <td>
                    {fmtOdd(order.requestedOdd)} / {fmtOdd(order.minimumOdd)} / {fmtOdd(order.acceptedOdd)}
                  </td>
                  <td>{fmtMoney(order.payout, order.currency)}</td>
                  <td className={styles.mono}>{order.externalOrderId ?? '—'}</td>
                  <td className={styles.mono} title={order.receipt?.receiptHash}>
                    {order.receipt ? shortId(order.receipt.receiptHash, 12) : '—'}
                  </td>
                  <td>
                    {order.reconciliation
                      ? `${order.reconciliation.result} (${order.reconciliation.severity})`
                      : 'Jamais rapproché'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.hasMore && (
        <div className={styles.row}>
          <button type="button" className={styles.button} disabled={props.loadingMore} onClick={props.onLoadMore}>
            {props.loadingMore ? 'Chargement…' : 'Ordres plus anciens'}
          </button>
        </div>
      )}
    </section>
  );
}
