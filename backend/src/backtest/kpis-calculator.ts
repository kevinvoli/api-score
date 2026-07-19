import {
  BacktestKpis,
  BacktestStrategy,
  DecidedBet,
  StakedBet,
} from './backtest.types';

/**
 * Applique le staking dans l'ordre chronologique des décisions puis calcule
 * les KPIs. Fonction pure : aucun accès DB, résultats reproductibles.
 *
 * Les NO_RESULT (match jamais arrivé à un statut terminal — trous de sync)
 * ont un profit nul et sont EXCLUS du hit-rate et du ROI : les compter en
 * victoire implicite est précisément le biais qui produisait un taux de 100 %.
 */
export function applyStakingAndComputeKpis(
  bets: DecidedBet[],
  strategy: BacktestStrategy,
): { staked: StakedBet[]; kpis: BacktestKpis } {
  const ordered = [...bets].sort(
    (a, b) => a.decisionAt.getTime() - b.decisionAt.getTime(),
  );

  let bankroll = strategy.bankroll;
  let peak = bankroll;
  let maxDrawdownPct = 0;
  let totalStaked = 0;
  let netProfit = 0;

  const staked: StakedBet[] = [];
  const byMarket = new Map<
    string,
    { bets: number; won: number; lost: number; staked: number; profit: number }
  >();

  for (const bet of ordered) {
    const stake =
      strategy.staking.type === 'PERCENT_BANKROLL'
        ? Math.max(0, (bankroll * strategy.staking.amount) / 100)
        : strategy.staking.amount;

    let profit = 0;
    if (bet.outcome === 'WON') profit = (bet.oddAtDecision - 1) * stake;
    else if (bet.outcome === 'LOST') profit = -stake;

    if (bet.outcome !== 'NO_RESULT') {
      totalStaked += stake;
      netProfit += profit;
      bankroll += profit;
      peak = Math.max(peak, bankroll);
      if (peak > 0) {
        maxDrawdownPct = Math.max(
          maxDrawdownPct,
          ((peak - bankroll) / peak) * 100,
        );
      }
    }

    const m = byMarket.get(bet.marketType) ?? {
      bets: 0,
      won: 0,
      lost: 0,
      staked: 0,
      profit: 0,
    };
    m.bets += 1;
    if (bet.outcome === 'WON') m.won += 1;
    if (bet.outcome === 'LOST') m.lost += 1;
    if (bet.outcome !== 'NO_RESULT') {
      m.staked += stake;
      m.profit += profit;
    }
    byMarket.set(bet.marketType, m);

    staked.push({ ...bet, stake, profit });
  }

  const won = staked.filter((b) => b.outcome === 'WON').length;
  const lost = staked.filter((b) => b.outcome === 'LOST').length;
  const noResult = staked.filter((b) => b.outcome === 'NO_RESULT').length;
  const resolved = won + lost;

  const edges = staked
    .filter((b) => b.outcome !== 'NO_RESULT' && b.edgePct !== null)
    .map((b) => b.edgePct as number);

  const yieldByMarket: BacktestKpis['yieldByMarket'] = {};
  for (const [market, m] of byMarket) {
    const mResolved = m.won + m.lost;
    yieldByMarket[market] = {
      bets: m.bets,
      roiPct: m.staked > 0 ? round2((m.profit / m.staked) * 100) : 0,
      hitRate: mResolved > 0 ? round2((m.won / mResolved) * 100) : 0,
    };
  }

  return {
    staked,
    kpis: {
      betCount: staked.length,
      wonBets: won,
      lostBets: lost,
      noResultBets: noResult,
      hitRate: resolved > 0 ? round2((won / resolved) * 100) : 0,
      roiPct: totalStaked > 0 ? round2((netProfit / totalStaked) * 100) : 0,
      yieldByMarket,
      maxDrawdownPct: round2(maxDrawdownPct),
      avgRealizedEdgePct: edges.length
        ? round2(edges.reduce((s, e) => s + e, 0) / edges.length)
        : 0,
      finalBankroll: round2(bankroll),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
