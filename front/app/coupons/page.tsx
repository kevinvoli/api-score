'use client';

import { useQuery } from '@tanstack/react-query';
import { CouponSelectionRow } from '../../components/coupon-selection-row/CouponSelectionRow';
import { useLiveFixtures } from '../../lib/hooks/useLiveFixtures';
import { useCouponBuilderStore } from '../../lib/state/couponBuilder';
import { useUiControlsStore } from '../../lib/state/uiControls';
import { getTeamName, toNumber } from '../../lib/utils/fixture';
import { fetchCouponHistory, SmartCoupon } from '../../lib/api/live';

// ── Coupon status badge ───────────────────────────────────────
function StatusBadge({ status }: { status: SmartCoupon['status'] }) {
  const map = {
    PENDING: { label: 'En cours',  cls: 'coupon-hist-badge--pending' },
    WON:     { label: 'Gagné',     cls: 'coupon-hist-badge--won'     },
    LOST:    { label: 'Échoué',    cls: 'coupon-hist-badge--lost'    },
  } as const;
  const { label, cls } = map[status];
  return <span className={`coupon-hist-badge ${cls}`}>{label}</span>;
}

// ── Ligne d'historique ────────────────────────────────────────
function CouponHistoryRow({ coupon }: { coupon: SmartCoupon }) {
  const fixture = coupon.homeTeamName && coupon.awayTeamName
    ? `${coupon.homeTeamName} vs ${coupon.awayTeamName}`
    : coupon.fixtureId;

  const date = new Date(coupon.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`coupon-hist-row coupon-hist-row--${coupon.status.toLowerCase()}`}>
      <div className="coupon-hist-left">
        <StatusBadge status={coupon.status} />
        <div className="coupon-hist-info">
          <span className="coupon-hist-fixture">{fixture}</span>
          <span className="coupon-hist-selection">{coupon.selection}</span>
          {coupon.reasons?.[0] && (
            <span className="coupon-hist-reason">{coupon.reasons[0]}</span>
          )}
        </div>
      </div>
      <div className="coupon-hist-right">
        <span className="coupon-hist-market">{coupon.marketType}</span>
        {coupon.currentOdd !== null && (
          <span className="coupon-hist-odd">{Number(coupon.currentOdd).toFixed(2)}</span>
        )}
        {coupon.confidenceScore !== null && (
          <span className="coupon-hist-conf">{coupon.confidenceScore}%</span>
        )}
        <span className="coupon-hist-date">{date}</span>
        {coupon.resolvedAt && (
          <span className="coupon-hist-resolved">
            Résolu : {new Date(coupon.resolvedAt).toLocaleDateString('fr-FR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────
export default function CouponsPage() {
  const { data: liveData } = useLiveFixtures();
  const { activeFixtureId } = useUiControlsStore();
  const { selections, removeSelection, stake, mode, toggleMode, setStake } = useCouponBuilderStore();

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['coupon-history'],
    queryFn:  () => fetchCouponHistory(100, 0),
    staleTime: 30_000,
  });

  const normalizedActiveId = activeFixtureId ? String(activeFixtureId) : null;
  const selectedFixture =
    liveData?.items?.find((item) => String(item.providerFixtureId) === normalizedActiveId) ??
    liveData?.items?.[0];

  const homeName = getTeamName(selectedFixture, 'home');
  const awayName = getTeamName(selectedFixture, 'away');
  const totalOdd = selections.reduce((acc, item) => acc * item.odd, 1);
  const estimatedReturn = stake * totalOdd;

  const coupons = historyData?.data ?? [];
  const pending = coupons.filter((c) => c.status === 'PENDING');
  const won     = coupons.filter((c) => c.status === 'WON');
  const lost    = coupons.filter((c) => c.status === 'LOST');

  return (
    <section className="content">

      {/* ── Coupon builder ── */}
      <div className="hero">
        <p className="eyebrow">Coupons</p>
        <h1>Bulletin de jeu</h1>
      </div>

      <div className="coupon-panel">
        <div className="coupon-header">
          <div>
            <h2>Coupon sélectionné</h2>
            <p className="coupon-meta">
              {selectedFixture ? `${homeName} vs ${awayName}` : 'Aucun match sélectionné'}
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
          <div><p>Total odds</p><strong>{totalOdd.toFixed(2)}</strong></div>
          <div><p>Mise</p><strong>{stake.toFixed(0)} €</strong></div>
          <div><p>Retour estimé</p><strong>{estimatedReturn.toFixed(0)} €</strong></div>
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
      </div>

      {/* ── Historique ── */}
      <div className="coupon-hist-section">
        <div className="coupon-hist-header">
          <h2>Historique des coupons automatiques</h2>
          <div className="coupon-hist-stats">
            <span className="coupon-hist-stat coupon-hist-stat--pending">{pending.length} en cours</span>
            <span className="coupon-hist-stat coupon-hist-stat--won">{won.length} gagnés</span>
            <span className="coupon-hist-stat coupon-hist-stat--lost">{lost.length} échoués</span>
            {coupons.length > 0 && (
              <span className="coupon-hist-stat">
                Taux : {won.length + lost.length > 0
                  ? `${Math.round((won.length / (won.length + lost.length)) * 100)}%`
                  : '—'}
              </span>
            )}
          </div>
        </div>

        {isLoading && <p className="coupon-hist-loading">Chargement…</p>}

        {!isLoading && !coupons.length && (
          <p className="coupon-hist-empty">
            Aucun coupon enregistré. Synchronisez un match live pour générer des suggestions.
          </p>
        )}

        {!isLoading && coupons.length > 0 && (
          <div className="coupon-hist-list">
            {coupons.map((coupon) => (
              <CouponHistoryRow key={coupon.id} coupon={coupon} />
            ))}
          </div>
        )}
      </div>

    </section>
  );
}
