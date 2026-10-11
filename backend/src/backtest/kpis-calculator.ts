import {
  BacktestKpis,
  BacktestStrategy,
  DecidedBet,
  SignalAccounting,
  SignalRecord,
  StakedBet,
} from './backtest.types';

const Z_95 = 1.96;

/**
 * Applique le staking dans l'ordre chronologique des décisions puis calcule
 * les KPIs. Fonction pure : aucun accès DB, résultats reproductibles.
 *
 * Les NO_RESULT (match jamais arrivé à un statut terminal — trous de sync)
 * ont un profit nul et sont EXCLUS du hit-rate et du ROI : les compter en
 * victoire implicite est précisément le biais qui produisait un taux de 100 %.
 *
 * Les VOID (match annulé/reporté, mise rendue) suivent la règle de la simulation :
 * profit nul, hors mise totale, hit-rate et ROI, sans effet sur la bankroll.
 *
 * La mise est plafonnée à la bankroll disponible : une bankroll épuisée ne
 * place plus rien (pari compté dans `bankrollSkippedBets`), jamais de solde négatif.
 */
export function applyStakingAndComputeKpis(
  bets: DecidedBet[],
  strategy: BacktestStrategy,
): { staked: StakedBet[]; kpis: BacktestKpis } {
  const ordered = [...bets].sort(
    (a, b) => a.decisionAt.getTime() - b.decisionAt.getTime(),
  );

  let bankroll = Math.max(0, strategy.bankroll);
  let peak = bankroll;
  let maxDrawdownPct = 0;
  let totalStaked = 0;
  let netProfit = 0;

  const staked: StakedBet[] = [];
  const unitReturns: number[] = [];
  const byMarket = new Map<
    string,
    { bets: number; won: number; lost: number; staked: number; profit: number }
  >();

  for (const bet of ordered) {
    const requested =
      strategy.staking.type === 'PERCENT_BANKROLL'
        ? (bankroll * strategy.staking.amount) / 100
        : strategy.staking.amount;
    const stake = Math.max(0, Math.min(requested, bankroll));
    const placed = stake > 0;

    let profit = 0;
    if (placed && bet.outcome === 'WON')
      profit = (bet.oddAtDecision - 1) * stake;
    else if (placed && bet.outcome === 'LOST') profit = -stake;

    const settledWithRisk = bet.outcome === 'WON' || bet.outcome === 'LOST';
    if (placed && settledWithRisk) {
      totalStaked += stake;
      netProfit += profit;
      bankroll += profit;
      unitReturns.push(profit / stake);
      peak = Math.max(peak, bankroll);
      if (peak > 0) {
        maxDrawdownPct = Math.max(
          maxDrawdownPct,
          ((peak - bankroll) / peak) * 100,
        );
      }
    }

    if (placed) {
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
      if (settledWithRisk) {
        m.staked += stake;
        m.profit += profit;
      }
      byMarket.set(bet.marketType, m);
    }

    staked.push({ ...bet, stake, profit, placed });
  }

  const placedBets = staked.filter((b) => b.placed);
  const won = placedBets.filter((b) => b.outcome === 'WON').length;
  const lost = placedBets.filter((b) => b.outcome === 'LOST').length;
  const noResult = placedBets.filter((b) => b.outcome === 'NO_RESULT').length;
  const voided = placedBets.filter((b) => b.outcome === 'VOID').length;
  const resolved = won + lost;

  const edges = placedBets
    .filter(
      (b) =>
        (b.outcome === 'WON' || b.outcome === 'LOST') && b.edgePct !== null,
    )
    .map((b) => b.edgePct as number);

  const slippages = placedBets
    .filter((b) => b.quotedOdd > 0)
    .map((b) => ((b.oddAtDecision - b.quotedOdd) / b.quotedOdd) * 100);

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
      betCount: placedBets.length,
      wonBets: won,
      lostBets: lost,
      noResultBets: noResult,
      voidBets: voided,
      hitRate: resolved > 0 ? round2((won / resolved) * 100) : 0,
      roiPct: totalStaked > 0 ? round2((netProfit / totalStaked) * 100) : 0,
      yieldByMarket,
      maxDrawdownPct: round2(maxDrawdownPct),
      avgRealizedEdgePct: edges.length
        ? round2(edges.reduce((s, e) => s + e, 0) / edges.length)
        : 0,
      finalBankroll: round2(bankroll),
      totalStaked: round2(totalStaked),
      netProfit: round2(netProfit),
      bankrollSkippedBets: staked.length - placedBets.length,
      avgSlippagePct: slippages.length ? round2(mean(slippages)) : null,
      roiCi95: confidenceInterval95(unitReturns),
    },
  };
}

/** Compte les signaux par stade atteint et en déduit la couverture de cote exécutable. */
export function summarizeSignals(signals: SignalRecord[]): SignalAccounting {
  const count = (stage: SignalRecord['stage']) =>
    signals.filter((signal) => signal.stage === stage).length;

  const noQuoteAtDecision = count('NO_QUOTE_AT_DECISION');
  const noQuoteAtExecution = count('NO_QUOTE_AT_EXECUTION');
  const covered = signals.length - noQuoteAtDecision - noQuoteAtExecution;

  return {
    signals: signals.length,
    noQuoteAtDecision,
    belowMinOddAtDecision: count('BELOW_MIN_ODD_AT_DECISION'),
    noQuoteAtExecution,
    belowMinOddAtExecution: count('BELOW_MIN_ODD_AT_EXECUTION'),
    placed: count('PLACED'),
    oddsCoveragePct: signals.length
      ? round2((covered / signals.length) * 100)
      : null,
  };
}

function confidenceInterval95(
  returns: number[],
): { lowPct: number; highPct: number } | null {
  if (returns.length < 2) return null;
  const average = mean(returns);
  const variance =
    returns.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (returns.length - 1);
  const margin = Z_95 * Math.sqrt(variance / returns.length);
  return {
    lowPct: round2((average - margin) * 100),
    highPct: round2((average + margin) * 100),
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
