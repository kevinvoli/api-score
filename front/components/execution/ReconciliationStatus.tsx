'use client';

import { useState } from 'react';
import type { Permission } from '../../lib/hooks/useCurrentUser';
import type { AccountView, ControlView, ReconciliationRun } from '../../lib/types/execution';
import { fmtDateTime } from './format';
import styles from './execution.module.css';

export interface ReconciliationStatusProps {
  health: ControlView['reconciliation'] | undefined;
  healthUnknown: boolean;
  accounts: AccountView[];
  canReconcile: Permission;
  onStart: (accountId: string) => void;
  pending: boolean;
  error: string | null;
  run: ReconciliationRun | undefined;
}

export const healthTone = (
  health: ControlView['reconciliation'] | undefined,
  unknown: boolean,
): 'ok' | 'warn' | 'bad' => {
  if (unknown || !health) return 'warn';
  if (health.criticalCount > 0 || health.status === 'FAILED') return 'bad';
  if (health.status === 'NEVER_RUN' || health.status === 'RUNNING') return 'warn';
  return 'ok';
};

const healthLabel = (health: ControlView['reconciliation'] | undefined, unknown: boolean): string => {
  if (unknown || !health) return 'Inconnue';
  if (health.status === 'NEVER_RUN') return 'Jamais exécutée';
  if (health.criticalCount > 0) return `${health.criticalCount} écart(s) critique(s)`;
  if (health.status === 'FAILED') return 'Dernier run en échec';
  if (health.status === 'RUNNING') return 'En cours';
  return 'Sans écart critique';
};

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

/**
 * Santé du dernier rapprochement et lancement d'un run sur 24 h (OPERATOR+). Un écart critique
 * maintient l'exécution arrêtée côté backend ; l'écran ne fait que le montrer.
 */
export function ReconciliationStatus(props: ReconciliationStatusProps) {
  const [accountId, setAccountId] = useState('');
  const selected = props.accounts.some((a) => a.id === accountId) ? accountId : (props.accounts[0]?.id ?? '');
  const disabled = !props.canReconcile.allowed || props.pending || !selected;
  const items = props.run
    ? [...props.run.items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  return (
    <section className={styles.panel} aria-label="Réconciliation">
      <h3 className={styles.panelTitle}>Réconciliation</h3>
      <div className={styles.row}>
        <span className={styles.badge} data-tone={healthTone(props.health, props.healthUnknown)}>
          {healthLabel(props.health, props.healthUnknown)}
        </span>
        <span className={styles.hint}>Dernier run : {fmtDateTime(props.health?.lastRunAt ?? null)}</span>
      </div>

      <div className={styles.row}>
        <select
          aria-label="Compte à rapprocher"
          className={styles.select}
          value={selected}
          onChange={(event) => setAccountId(event.target.value)}
          disabled={!props.canReconcile.allowed || props.accounts.length === 0}
        >
          {props.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.mode} · {account.operatorKey} · {account.currency}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.button}
          disabled={disabled}
          title={props.canReconcile.reason ?? undefined}
          onClick={() => {
            if (!disabled) props.onStart(selected);
          }}
        >
          {props.pending ? 'Réconciliation…' : 'Réconcilier les dernières 24 h'}
        </button>
        {!props.canReconcile.allowed && <span className={styles.hint}>{props.canReconcile.reason}</span>}
      </div>
      {props.accounts.length === 0 && <p className={styles.hint}>Aucun compte à rapprocher.</p>}
      {props.error && <p className={styles.error}>{props.error}</p>}

      {props.run && (
        <div>
          <p className={styles.hint}>
            Run {props.run.status} · {props.run.criticalCount} critique(s) · {fmtDateTime(props.run.rangeFrom)} →{' '}
            {fmtDateTime(props.run.rangeTo)}
          </p>
          {props.run.error && <p className={styles.error}>{props.run.error}</p>}
          {items.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Gravité</th>
                    <th>Type</th>
                    <th>Résultat</th>
                    <th>Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={item.severity === 'CRITICAL' ? styles.ambiguous : undefined}>
                      <td>
                        <span
                          className={styles.badge}
                          data-tone={item.severity === 'CRITICAL' ? 'bad' : item.severity === 'WARNING' ? 'warn' : 'ok'}
                        >
                          {item.severity}
                        </span>
                      </td>
                      <td>{item.itemType}</td>
                      <td>{item.result}</td>
                      <td>{item.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
