'use client';

import { useState } from 'react';
import { DecisionJournalTable } from '../../components/simulation/DecisionJournalTable';
import { SimulationSummary } from '../../components/simulation/SimulationSummary';
import styles from '../../components/simulation/simulation.module.css';
import { describeMutationError } from '../../lib/api/execution';
import { usePermission } from '../../lib/hooks/useCurrentUser';
import {
  useSimulationDecisions,
  useSimulationRuns,
  useSimulationSummary,
  useStopSimulationRun,
} from '../../lib/hooks/useSimulation';
import type { DecisionStatus } from '../../lib/types/simulation';

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

/** Simulation continue (PLAN lot 5) : lecture des runs virtuels et arrêt d'un run (ADMIN). */
export default function SimulationPage() {
  const runs = useSimulationRuns();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? runs.data?.[0]?.id ?? null;
  const run = runs.data?.find((r) => r.id === activeId);
  const summary = useSimulationSummary(activeId);
  const [status, setStatus] = useState<DecisionStatus | null>(null);
  const decisions = useSimulationDecisions(activeId, status);
  const stop = useStopSimulationRun();
  const canStop = usePermission('ADMIN');

  return (
    <section className="analytics">
      <div className="analytics-header">
        <div>
          <h2>Simulation continue</h2>
          <p className="coupon-meta">
            {run
              ? `${run.name} · stratégie ${run.strategyVersion} · démarré ${fmtDate(run.startedAt)} · dernier tick ${fmtDate(run.lastTickAt)}`
              : runs.isLoading
                ? 'Chargement…'
                : runs.isError
                  ? 'Runs illisibles.'
                  : 'Aucun run de simulation.'}
          </p>
          <p className={styles.hint}>Bankroll virtuelle : aucune de ces décisions n’engage d’argent.</p>
        </div>
        <div className="analytics-badges">
          {runs.data && runs.data.length > 0 && (
            <select
              aria-label="Run de simulation"
              className={styles.select}
              value={activeId ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {runs.data.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.status} · {fmtDate(r.createdAt)}
                </option>
              ))}
            </select>
          )}
          {run?.status === 'RUNNING' && (
            <button
              type="button"
              className={styles.button}
              disabled={!canStop.allowed || stop.isPending}
              title={canStop.reason ?? undefined}
              onClick={() => stop.mutate(run.id)}
            >
              {stop.isPending ? 'Arrêt…' : 'Arrêter ce run'}
            </button>
          )}
        </div>
      </div>
      {stop.error && <p className={styles.error}>{describeMutationError(stop.error)}</p>}

      {activeId && (
        <>
          <SimulationSummary summary={summary.data} isLoading={summary.isLoading} isError={summary.isError} />
          <DecisionJournalTable
            decisions={decisions.data?.pages.flatMap((page) => page.data) ?? []}
            isLoading={decisions.isLoading}
            isError={decisions.isError}
            status={status}
            onStatusChange={setStatus}
            hasMore={decisions.hasNextPage ?? false}
            loadingMore={decisions.isFetchingNextPage}
            onLoadMore={() => void decisions.fetchNextPage()}
          />
        </>
      )}
    </section>
  );
}
