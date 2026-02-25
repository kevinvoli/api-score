'use client';

import Link from 'next/link';
import { useCouponBuilderStore } from '../../lib/state/couponBuilder';
import styles from './CouponPanel.module.css';

export function CouponPanel() {
  const { selections, removeSelection, stake, setStake, mode, toggleMode } =
    useCouponBuilderStore();

  const totalOdd = selections.reduce((acc, s) => acc * s.odd, 1);
  const estimatedGain = stake * totalOdd;
  const isEmpty = selections.length === 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <p className={styles.title}>Bulletin de jeu</p>
        {!isEmpty && (
          <span className={styles.count}>{selections.length}</span>
        )}
      </div>

      {isEmpty ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Aucune sélection</p>
          <p className={styles.emptyHint}>
            Les paris sélectionnés depuis les cotes apparaîtront ici.
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

          <button
            type="button"
            className={styles.modeBtn}
            onClick={toggleMode}
          >
            Mode : {mode === 'fixed' ? 'Fixe' : 'Kelly'}
          </button>

          <Link href="/coupons" className={styles.fullLink}>
            Voir le coupon complet →
          </Link>
        </>
      )}
    </div>
  );
}
