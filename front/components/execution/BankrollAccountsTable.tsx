import type { AccountView } from '../../lib/types/execution';
import { fmtMoney } from './format';
import styles from './execution.module.css';

export interface BankrollAccountsTableProps {
  accounts: AccountView[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Backend injoignable : les soldes affichés sont les derniers connus, pas l'état courant. */
  stale: boolean;
}

/** Soldes et exposition par compte (mode, opérateur, devise), tels que persistés par le ledger. */
export function BankrollAccountsTable({ accounts, isLoading, isError, stale }: BankrollAccountsTableProps) {
  return (
    <section className={styles.panel} aria-label="Bankroll">
      <h3 className={styles.panelTitle}>Bankroll et exposition</h3>
      {isError && !accounts && <p className={styles.error}>Comptes illisibles : soldes inconnus.</p>}
      {stale && accounts && (
        <p className={styles.warning}>Backend injoignable : derniers soldes connus, non confirmés.</p>
      )}
      {isLoading && <p className={styles.hint}>Chargement des comptes…</p>}
      {accounts && accounts.length === 0 && <p className={styles.hint}>Aucun compte de bankroll ouvert.</p>}
      {accounts && accounts.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mode</th>
                <th>Opérateur</th>
                <th>Disponible</th>
                <th>Réservé / exposition</th>
                <th>Total</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.mode}</td>
                  <td>{account.operatorKey}</td>
                  <td>{fmtMoney(account.availableBalance, account.currency)}</td>
                  <td>{fmtMoney(account.exposure, account.currency)}</td>
                  <td>{fmtMoney(account.totalBalance, account.currency)}</td>
                  <td>{account.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
