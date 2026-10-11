'use client';

import { useMemo, useState } from 'react';
import {
  useBacktestRun,
  useBacktestRuns,
  useRunBaselineBacktest,
  useWalkForwardRun,
  useWalkForwardRuns,
} from '../../lib/hooks/useBacktest';
import type { BetResult } from '../../lib/api/audit';
import { usePermission } from '../../lib/hooks/useCurrentUser';

const fmtPct = (n: number | undefined | null) =>
  n === undefined || n === null ? '—' : `${n.toFixed(1)} %`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

export default function AuditPage() {
  const { data: runs, isLoading } = useBacktestRuns();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const runBaseline = useRunBaselineBacktest();
  const canRun = usePermission();

  const activeId = selectedId ?? runs?.[0]?.id ?? null;
  const { data: run } = useBacktestRun(activeId);

  const kpis = run?.kpis ?? null;
  const bankrollStart = run?.strategy?.bankroll ?? 100;

  const curve = useMemo(() => {
    if (!run?.bets?.length) return [];
    let bankroll = bankrollStart;
    return run.bets.map((b) => {
      bankroll += Number(b.profit);
      return { at: b.decisionAt, bankroll, bet: b };
    });
  }, [run, bankrollStart]);

  const realOddsBets =
    run?.bets?.filter((b) => b.oddSource !== 'STRATEGY_DEFAULT').length ?? 0;

  return (
    <section className="analytics">
      <div className="analytics-header">
        <div>
          <h2>Audit &amp; backtest</h2>
          <p className="coupon-meta">
            {run
              ? `${run.name} · fenêtre ${fmtDate(run.windowStart)} → ${fmtDate(run.windowEnd)}`
              : isLoading
                ? 'Chargement…'
                : 'Aucun run — lance un backtest baseline.'}
          </p>
        </div>
        <div className="analytics-badges">
          {runs && runs.length > 0 && (
            <select
              className="badge-chip"
              value={activeId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border-strong)',
                cursor: 'pointer',
              }}
            >
              {runs.map((r) => (
                <option
                  key={r.id}
                  value={r.id}
                  style={{ background: 'var(--color-surface)' }}
                >
                  {r.name} · {fmtDate(r.createdAt)} · {r.status}
                </option>
              ))}
            </select>
          )}
          <button
            className="badge-chip"
            style={{ cursor: 'pointer', border: '1px solid var(--color-border-strong)' }}
            disabled={runBaseline.isPending || !canRun.allowed}
            title={canRun.reason ?? undefined}
            onClick={() => runBaseline.mutate()}
          >
            {runBaseline.isPending ? 'Backtest en cours…' : 'Lancer un backtest baseline'}
          </button>
        </div>
      </div>

      {kpis && (
        <>
          <div className="analytics-grid">
            <div className="analytics-card">
              <h3>Paris</h3>
              <p className="analytics-value">{kpis.betCount}</p>
              <span>
                {kpis.wonBets} gagnés · {kpis.lostBets} perdus · {kpis.voidBets ?? 0} remboursés ·{' '}
                {kpis.noResultBets} sans résultat
              </span>
            </div>
            <div className="analytics-card">
              <h3>Hit-rate</h3>
              <p className="analytics-value">{fmtPct(kpis.hitRate)}</p>
              <span>gagnés / (gagnés + perdus) — remboursés et sans-résultat exclus</span>
            </div>
            <div className="analytics-card">
              <h3>ROI</h3>
              <p className="analytics-value">{fmtPct(kpis.roiPct)}</p>
              <span>profit net / total misé</span>
            </div>
            <div className="analytics-card">
              <h3>Drawdown max</h3>
              <p className="analytics-value">{fmtPct(kpis.maxDrawdownPct)}</p>
              <span>pire creux depuis un pic de bankroll</span>
            </div>
          </div>

          {run && realOddsBets < run.totalBets && (
            <p className="coupon-meta" style={{ color: 'var(--color-warning)' }}>
              ⚠ {run.totalBets - realOddsBets} paris sur {run.totalBets} utilisent la cote
              par défaut de la stratégie (pas une cote de marché) — le ROI n&apos;est pas
              une prévision de rendement réel.
            </p>
          )}

          <BankrollChart curve={curve} start={bankrollStart} />

          <div className="analytics-grid">
            {Object.entries(kpis.yieldByMarket).map(([market, y]) => (
              <div className="analytics-card" key={market}>
                <h3>{market}</h3>
                <p className="analytics-value">{fmtPct(y.roiPct)}</p>
                <span>
                  {y.bets} paris · hit-rate {fmtPct(y.hitRate)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {run?.bets && run.bets.length > 0 && (
        <div className="coupon-hist-list">
          {run.bets.map((b) => (
            <BetRow key={b.id} bet={b} />
          ))}
        </div>
      )}

      <WalkForwardSection />
    </section>
  );
}

const WF_REASONS: Record<string, string> = {
  INCOMPLETE_WINDOW: 'fenêtre incomplète',
  NO_SIGNAL: 'aucun signal',
  INSUFFICIENT_ODDS_COVERAGE: 'couverture de cote insuffisante',
};

/**
 * Lecture des validations walk-forward (lot 4). Le lancement exige une stratégie figée complète et
 * reste serveur à serveur : aucun bouton ici ne démarre de run.
 */
function WalkForwardSection() {
  const { data: runs, isLoading, isError } = useWalkForwardRuns();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? runs?.[0]?.id ?? null;
  const { data: run } = useWalkForwardRun(activeId);
  const summary = run?.summary ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
      <div className="analytics-header">
        <div>
          <h2>Validation walk-forward</h2>
          <p className="coupon-meta">
            {isError
              ? 'Runs walk-forward illisibles.'
              : isLoading
                ? 'Chargement…'
                : !runs || runs.length === 0
                  ? 'Aucun run walk-forward. Le lancement se fait côté serveur (POST /v1/audit/walk-forward).'
                  : run
                    ? `Stratégie ${run.strategyVersion} · ${fmtDate(run.rangeFrom)} → ${fmtDate(run.rangeTo)} · ${run.status}`
                    : 'Chargement du run…'}
          </p>
        </div>
        {runs && runs.length > 0 && (
          <div className="analytics-badges">
            <select
              aria-label="Run walk-forward"
              className="badge-chip"
              value={activeId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{ background: 'transparent', border: '1px solid var(--color-border-strong)', cursor: 'pointer' }}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id} style={{ background: 'var(--color-surface)' }}>
                  {r.strategyVersion} · {fmtDate(r.createdAt)} · {r.status}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {run?.error && (
        <p className="coupon-meta" style={{ color: 'var(--color-error)' }}>
          {run.error}
        </p>
      )}

      {summary && (
        <div className="analytics-grid">
          <div className="analytics-card">
            <h3>Folds éligibles</h3>
            <p className="analytics-value">
              {summary.eligibleFolds} / {summary.folds}
            </p>
            <span>
              {Object.entries(summary.ineligibleByReason)
                .map(([reason, count]) => `${count} ${WF_REASONS[reason] ?? reason}`)
                .join(' · ') || 'aucun fold écarté'}
            </span>
          </div>
          <div className="analytics-card">
            <h3>ROI hors échantillon</h3>
            <p className="analytics-value">{fmtPct(summary.test.kpis.roiPct)}</p>
            <span>
              {summary.test.kpis.betCount} paris · hit-rate {fmtPct(summary.test.kpis.hitRate)}
            </span>
          </div>
          <div className="analytics-card">
            <h3>Drawdown max (test)</h3>
            <p className="analytics-value">{fmtPct(summary.test.kpis.maxDrawdownPct)}</p>
            <span>fenêtres de test enchaînées sur une seule bankroll</span>
          </div>
          <div className="analytics-card">
            <h3>Couverture de cote</h3>
            <p className="analytics-value">{fmtPct(summary.test.signals.oddsCoveragePct)}</p>
            <span>
              {summary.test.signals.placed} placés sur {summary.test.signals.signals} signaux
            </span>
          </div>
        </div>
      )}

      {run && run.folds.length > 0 && (
        <div className="coupon-hist-list">
          {run.folds.map((fold) => (
            <div className="coupon-hist-info" key={fold.id}>
              <span
                className={
                  fold.status === 'COMPLETED'
                    ? 'coupon-hist-badge coupon-hist-badge--won'
                    : 'coupon-hist-badge coupon-hist-badge--pending'
                }
              >
                Fold {fold.foldIndex}
              </span>
              <span className="coupon-hist-market">
                test {fmtDate(fold.testFrom)} → {fmtDate(fold.testTo)}
              </span>
              <span className="coupon-hist-fixture">
                {fold.status === 'COMPLETED'
                  ? `ROI ${fmtPct(fold.metrics.test.kpis.roiPct)} · ${fold.metrics.test.kpis.betCount} paris`
                  : `écarté : ${WF_REASONS[fold.ineligibilityReason ?? ''] ?? fold.ineligibilityReason}`}
              </span>
              <span className="coupon-hist-odd">
                validation ROI {fmtPct(fold.metrics.validation.kpis.roiPct)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BetRow({ bet }: { bet: BetResult }) {
  const badgeClass =
    bet.outcome === 'WON'
      ? 'coupon-hist-badge coupon-hist-badge--won'
      : bet.outcome === 'LOST'
        ? 'coupon-hist-badge coupon-hist-badge--lost'
        : 'coupon-hist-badge coupon-hist-badge--pending';
  const label =
    bet.outcome === 'WON'
      ? 'Gagné'
      : bet.outcome === 'LOST'
        ? 'Perdu'
        : bet.outcome === 'VOID'
          ? 'Remboursé'
          : 'Sans résultat';
  return (
    <div className="coupon-hist-info">
      <span className={badgeClass}>
        {label}
      </span>
      <span className="coupon-hist-market">{bet.marketType}</span>
      <span className="coupon-hist-fixture">{bet.selection}</span>
      <span className="coupon-hist-odd">
        @{Number(bet.oddAtDecision).toFixed(2)}
        {bet.oddSource === 'STRATEGY_DEFAULT' ? ' (défaut)' : ''}
      </span>
      <span className="coupon-hist-date">
        {new Date(bet.decisionAt).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
        {bet.elapsedAtDecision !== null ? ` · ${bet.elapsedAtDecision}'` : ''}
      </span>
    </div>
  );
}

const W = 900;
const H = 240;
const PAD = { top: 16, right: 64, bottom: 24, left: 48 };

function BankrollChart({
  curve,
  start,
}: {
  curve: { at: string; bankroll: number; bet: BetResult }[];
  start: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (curve.length < 2) return null;

  const values = [start, ...curve.map((p) => p.bankroll)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) =>
    PAD.left + ((W - PAD.left - PAD.right) * i) / curve.length;
  const y = (v: number) =>
    PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - min) / span);

  const path = [`M ${x(0)} ${y(start)}`]
    .concat(curve.map((p, i) => `L ${x(i + 1)} ${y(p.bankroll)}`))
    .join(' ');

  const last = curve[curve.length - 1];
  const gridLines = [min, (min + max) / 2, max];
  const hovered = hover !== null ? curve[hover] : null;

  return (
    <div className="analytics-card" style={{ overflow: 'visible' }}>
      <h3>Bankroll cumulée (mise à mise)</h3>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            const i = Math.round(
              ((px - PAD.left) / (W - PAD.left - PAD.right)) * curve.length,
            );
            setHover(Math.max(0, Math.min(curve.length - 1, i - 1)));
          }}
        >
          {gridLines.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(v) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-text-muted)"
              >
                {v.toFixed(0)}
              </text>
            </g>
          ))}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(start)}
            y2={y(start)}
            stroke="var(--color-text-muted)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <path d={path} fill="none" stroke="var(--color-info)" strokeWidth={2} />
          <text
            x={x(curve.length) + 6}
            y={y(last.bankroll) + 4}
            fontSize={12}
            fill="var(--color-text-primary)"
          >
            {last.bankroll.toFixed(1)}
          </text>
          {hovered && hover !== null && (
            <g>
              <line
                x1={x(hover + 1)}
                x2={x(hover + 1)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--color-border-strong)"
                strokeWidth={1}
              />
              <circle
                cx={x(hover + 1)}
                cy={y(hovered.bankroll)}
                r={4}
                fill="var(--color-info)"
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
        {hovered && hover !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${((x(hover + 1) / W) * 100).toFixed(1)}%`,
              top: 0,
              transform: 'translateX(-50%)',
              background: 'var(--color-surface-alt)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              fontSize: 12,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          >
            <div style={{ color: 'var(--color-text-primary)' }}>
              {hovered.bankroll.toFixed(2)} après ce pari
            </div>
            <div style={{ color: 'var(--color-text-secondary)' }}>
              {hovered.bet.selection} · {Number(hovered.bet.profit) >= 0 ? '+' : ''}
              {Number(hovered.bet.profit).toFixed(2)}
            </div>
          </div>
        )}
      </div>
      <span>Départ {start} · pointillés = bankroll initiale · survolez pour le détail</span>
    </div>
  );
}
