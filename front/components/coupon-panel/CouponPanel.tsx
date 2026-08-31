'use client';

import Link from 'next/link';
import { useCouponBuilderStore } from '../../lib/state/couponBuilder';
import { useSmartSuggestions } from '../../lib/hooks/useSmartSuggestions';
import type { SmartSuggestion } from '../../lib/api/smartSuggestions';
import styles from './CouponPanel.module.css';

// ── Barre de confiance ──────────────────────────────────────────
interface ConfBarProps {
  confidenceScore: number | null;
  baseRateSampleSize: number | null;
}

function ConfBar({ confidenceScore, baseRateSampleSize }: ConfBarProps) {
  if (confidenceScore === null) {
    return <span className={styles.confUnavailable}>Taux indisponible</span>;
  }
  const pct = Math.round(Math.max(0, Math.min(100, confidenceScore)));
  const color = pct >= 75 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className={styles.confBarRow}>
      <div className={styles.confBar}>
        <div className={styles.confBarFill} style={{ width: `${pct}%`, background: color }} />
        <span className={styles.confPct} style={{ color }}>{pct}%</span>
      </div>
      {baseRateSampleSize !== null && (
        <span className={styles.confSample}>
          sur {baseRateSampleSize} match{baseRateSampleSize > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ── Carte suggestion ────────────────────────────────────────────
function SuggestionCard({
  rec,
  alreadyAdded,
  onAdd,
}: {
  rec: SmartSuggestion;
  alreadyAdded: boolean;
  onAdd: () => void;
}) {
  return (
    <div className={styles.suggCard}>
      <p className={styles.suggFixture}>{rec.fixtureLabel}</p>
      <div className={styles.suggMeta}>
        <span className={styles.suggMarket}>{rec.marketType}</span>
        <span className={styles.suggOdd}>{rec.currentOdd.toFixed(2)}</span>
      </div>
      <p className={styles.suggSelection}>{rec.selection}</p>
      <ConfBar confidenceScore={rec.confidenceScore} baseRateSampleSize={rec.baseRateSampleSize} />
      {rec.shotsCount > 0 && (
        <span className={styles.suggEdge}>{rec.shotsCount} tirs · {rec.elapsed}&apos;</span>
      )}
      {rec.reasons.length > 0 && (
        <p className={styles.suggReason}>{rec.reasons[0]}</p>
      )}
      <button
        type="button"
        className={alreadyAdded ? styles.suggBtnAdded : styles.suggBtn}
        onClick={onAdd}
        disabled={alreadyAdded}
      >
        {alreadyAdded ? '✓ Ajouté' : '+ Ajouter'}
      </button>
    </div>
  );
}

// ── Panel principal ─────────────────────────────────────────────
export function CouponPanel() {
  const { selections, removeSelection, stake, setStake, mode, toggleMode, addSelection } =
    useCouponBuilderStore();

  const { data: suggestions = [], isLoading: suggestionsLoading } = useSmartSuggestions();

  const addedIds = new Set(selections.map((s) => s.id));

  const totalOdd = selections.reduce((acc, s) => acc * s.odd, 1);
  const estimatedGain = stake * totalOdd;
  const isEmpty = selections.length === 0;

  return (
    <div className={styles.panel}>

      {/* ── Suggestions ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.title}>Suggestions</p>
          {suggestions.length > 0 && (
            <span className={styles.count}>{suggestions.length}</span>
          )}
        </div>
        <div className={styles.criteria}>
          <span className={styles.criteriaTag}>Live · &lt;10 min</span>
          <span className={styles.criteriaTag}>≥ 5 tirs</span>
          <span className={styles.criteriaTag}>+0.5 buts</span>
        </div>

        {suggestionsLoading ? (
          <p className={styles.suggEmpty}>Analyse des matchs en cours…</p>
        ) : suggestions.length === 0 ? (
          <p className={styles.suggEmpty}>
            Aucun match live ne déclenche les critères actuellement.
          </p>
        ) : (
          <div className={styles.suggList}>
            {suggestions.map((rec) => (
              <SuggestionCard
                key={rec.id}
                rec={rec}
                alreadyAdded={addedIds.has(rec.id)}
                onAdd={() =>
                  addSelection({
                    id: rec.id,
                    selection: rec.selection,
                    fixtureLabel: rec.fixtureLabel,
                    odd: rec.currentOdd,
                    confidenceScore: rec.confidenceScore,
                    baseRateSampleSize: rec.baseRateSampleSize,
                    edge: rec.edgePct,
                    riskFlags: rec.riskFlags,
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Séparateur ── */}
      <div className={styles.divider} />

      {/* ── Bulletin de jeu ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.title}>Bulletin de jeu</p>
          {!isEmpty && <span className={styles.count}>{selections.length}</span>}
        </div>

        {isEmpty ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Aucune sélection</p>
            <p className={styles.emptyHint}>
              Ajoute une suggestion ou sélectionne une cote.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.selections}>
              {selections.map((s) => (
                <div key={s.id} className={styles.selectionRow}>
                  <div className={styles.selectionInfo}>
                    {s.fixtureLabel && (
                      <p className={styles.fixtureLabel}>{s.fixtureLabel}</p>
                    )}
                    <p className={styles.selectionName}>{s.selection}</p>
                    <p className={styles.oddValue}>{s.odd.toFixed(2)}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeSelection(s.id)}
                    aria-label="Retirer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>Total côte</span>
                <strong>{totalOdd.toFixed(2)}</strong>
              </div>
              <div className={styles.stakeRow}>
                <span>Mise</span>
                <input
                  className={styles.stakeInput}
                  type="number"
                  min={1}
                  value={stake}
                  onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
                />
              </div>
              <div className={styles.summaryRow}>
                <span>Gain potentiel</span>
                <strong className={styles.gain}>{estimatedGain.toFixed(0)} €</strong>
              </div>
            </div>

            <button type="button" className={styles.modeBtn} onClick={toggleMode}>
              Mode : {mode === 'fixed' ? 'Fixe' : 'Kelly'}
            </button>

            <Link href="/coupons" className={styles.fullLink}>
              Voir le coupon complet →
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
