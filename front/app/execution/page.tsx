'use client';

import { useState } from 'react';
import { BankrollAccountsTable } from '../../components/execution/BankrollAccountsTable';
import { ExecutionControlPanel } from '../../components/execution/ExecutionControlPanel';
import { OrdersTable } from '../../components/execution/OrdersTable';
import { ReconciliationStatus } from '../../components/execution/ReconciliationStatus';
import { RiskLimitsPanel } from '../../components/execution/RiskLimitsPanel';
import styles from '../../components/execution/execution.module.css';
import { describeMutationError } from '../../lib/api/execution';
import { usePermission } from '../../lib/hooks/useCurrentUser';
import {
  useChangeExecutionMode,
  useExecutionAccounts,
  useExecutionControl,
  useExecutionOrders,
  useReconciliationRun,
  useStartReconciliation,
  useStopExecution,
} from '../../lib/hooks/useExecution';
import type { OrderStatus } from '../../lib/types/execution';

/**
 * Console d'exploitation (PLAN lot 9). Elle n'évalue aucune règle et ne fait aucune transition
 * locale : chaque action part au backend, puis l'état affiché est relu depuis la base.
 */
export default function ExecutionPage() {
  const control = useExecutionControl();
  const accounts = useExecutionAccounts();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const orders = useExecutionOrders(statusFilter);
  const stop = useStopExecution();
  const changeMode = useChangeExecutionMode();
  const reconcile = useStartReconciliation();
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const lastRun = useReconciliationRun(lastRunId);

  const canStop = usePermission('ADMIN');
  const canChangeMode = usePermission('ADMIN');
  const canReconcile = usePermission('OPERATOR');

  const controlUnknown = control.isError || !control.data;
  const orderRows = orders.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section className="analytics">
      <div className="analytics-header">
        <div>
          <h2>Exécution</h2>
          <p className="coupon-meta">
            État persistant du kill switch, limites, bankroll, ordres et rapprochements. Rafraîchi toutes les 10 à
            15 secondes.
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <ExecutionControlPanel
          control={control.data}
          isLoading={control.isLoading}
          isError={control.isError}
          canStop={canStop}
          canChangeMode={canChangeMode}
          onStop={(reason) =>
            stop.mutate({ reason, expectedVersion: control.data?.version ?? undefined })
          }
          stopPending={stop.isPending}
          stopError={stop.error ? describeMutationError(stop.error) : null}
          onChangeMode={(input) => {
            const version = control.data?.version;
            if (version === null || version === undefined) return;
            changeMode.mutate({ ...input, expectedVersion: version });
          }}
          modePending={changeMode.isPending}
          modeError={changeMode.error ? describeMutationError(changeMode.error) : null}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RiskLimitsPanel limits={control.data?.activeLimits} stale={control.isError} />
          <ReconciliationStatus
            health={control.data?.reconciliation}
            healthUnknown={controlUnknown || control.isError}
            accounts={accounts.data ?? []}
            canReconcile={canReconcile}
            onStart={(accountId) =>
              reconcile.mutate(accountId, { onSuccess: (result) => setLastRunId(result.runId) })
            }
            pending={reconcile.isPending}
            error={reconcile.error ? describeMutationError(reconcile.error) : null}
            run={lastRun.data}
          />
        </div>
      </div>

      <BankrollAccountsTable
        accounts={accounts.data}
        isLoading={accounts.isLoading}
        isError={accounts.isError}
        stale={control.isError || accounts.isError}
      />

      <OrdersTable
        orders={orderRows}
        isLoading={orders.isLoading}
        isError={orders.isError}
        stale={control.isError || orders.isError}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        hasMore={orders.hasNextPage ?? false}
        loadingMore={orders.isFetchingNextPage}
        onLoadMore={() => void orders.fetchNextPage()}
      />
    </section>
  );
}
