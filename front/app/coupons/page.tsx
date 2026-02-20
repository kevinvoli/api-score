'use client';

import { CouponSelectionRow } from '../../components/coupon-selection-row/CouponSelectionRow';
import { useLiveFixtures } from '../../lib/hooks/useLiveFixtures';
import { useCouponBuilderStore } from '../../lib/state/couponBuilder';
import { useUiControlsStore } from '../../lib/state/uiControls';
import { getTeamName, toNumber } from '../../lib/utils/fixture';

export default function CouponsPage() {
  const { data } = useLiveFixtures();
  const { activeFixtureId } = useUiControlsStore();
  const { selections, removeSelection, stake, mode, toggleMode, setStake } = useCouponBuilderStore();

  const normalizedActiveId = activeFixtureId ? String(activeFixtureId) : null;
  const selectedFixture =
    data?.items?.find((item) => String(item.providerFixtureId) === normalizedActiveId) ?? data?.items?.[0];

  const homeName = getTeamName(selectedFixture, 'home');
  const awayName = getTeamName(selectedFixture, 'away');

  const totalOdd = selections.reduce((acc, item) => acc * item.odd, 1);
  const estimatedReturn = stake * totalOdd;

  return (
    <section className="coupon-panel">
      <div className="coupon-header">
        <div>
          <h2>Coupon sélectionné</h2>
          <p className="coupon-meta">
            {selectedFixture
              ? `${homeName} vs ${awayName}`
              : 'Aucun match sélectionné'}
          </p>
        </div>
        <div className="coupon-actions">
          <button className="navbar-btn" type="button" onClick={toggleMode}>
            Mode: {mode === 'fixed' ? 'Fixe' : 'Kelly'}
          </button>
          <input
            className="coupon-stake"
            type="number"
            min={1}
            value={stake}
            onChange={(event) => setStake(toNumber(event.target.value, 0))}
          />
        </div>
      </div>

      <div className="coupon-summary">
        <div>
          <p>Total odds</p>
          <strong>{totalOdd.toFixed(2)}</strong>
        </div>
        <div>
          <p>Mise</p>
          <strong>{stake.toFixed(0)} €</strong>
        </div>
        <div>
          <p>Retour estimé</p>
          <strong>{estimatedReturn.toFixed(0)} €</strong>
        </div>
      </div>

      <div className="coupon-list">
        {!selections.length && <p>Aucune sélection ajoutée.</p>}
        {selections.map((selection) => (
          <CouponSelectionRow
            key={selection.id}
            selection={selection.selection}
            marketType="Recommandation"
            fixtureLabel={selection.fixtureLabel}
            odd={selection.odd}
            confidence={selection.confidence}
            edgePct={selection.edge}
            riskFlags={selection.riskFlags}
            correlation={selection.edge >= 7 ? 'high' : selection.edge >= 4 ? 'medium' : 'low'}
            onRemove={() => removeSelection(selection.id)}
          />
        ))}
      </div>
    </section>
  );
}
