import { applyStakingAndComputeKpis } from './kpis-calculator';
import { BacktestStrategy, DecidedBet } from './backtest.types';

function strat(overrides: Partial<BacktestStrategy> = {}): BacktestStrategy {
  return {
    name: 't',
    version: '1',
    entryRules: {} as BacktestStrategy['entryRules'],
    markets: [],
    minEdgePct: 0,
    minConfidence: 0,
    staking: { type: 'FLAT', amount: 10 },
    odds: { source: ['STRATEGY_DEFAULT'], executionLatencyMs: 0 },
    bankroll: 100,
    ...overrides,
  };
}

function bet(overrides: Partial<DecidedBet> = {}): DecidedBet {
  return {
    fixtureId: 'f1',
    providerFixtureId: '1',
    marketType: 'Buts match',
    selection: 's',
    ruleName: 'r',
    teamId: 1,
    isHomeTeam: true,
    decisionAt: new Date('2026-03-06T20:00:00Z'),
    elapsedAtDecision: 25,
    oddAtDecision: 2.0,
    oddSource: 'STRATEGY_DEFAULT',
    edgePct: 10,
    confidenceScore: 70,
    outcome: 'WON',
    ...overrides,
  };
}

describe('applyStakingAndComputeKpis()', () => {
  it('calcule profit, ROI et hit-rate sur des paris résolus (staking FLAT)', () => {
    const bets = [
      bet({ outcome: 'WON', oddAtDecision: 2.0 }), // +10
      bet({ outcome: 'LOST', fixtureId: 'f2' }), // -10
    ];

    const { staked, kpis } = applyStakingAndComputeKpis(bets, strat());

    expect(staked.map((b) => b.profit)).toEqual([10, -10]);
    expect(kpis.betCount).toBe(2);
    expect(kpis.hitRate).toBe(50);
    expect(kpis.roiPct).toBe(0);
    expect(kpis.finalBankroll).toBe(100);
  });

  it('exclut les NO_RESULT du hit-rate, du ROI et de la bankroll', () => {
    const bets = [
      bet({ outcome: 'WON', oddAtDecision: 1.5 }), // +5
      bet({ outcome: 'NO_RESULT', fixtureId: 'f2' }),
      bet({ outcome: 'NO_RESULT', fixtureId: 'f3' }),
    ];

    const { staked, kpis } = applyStakingAndComputeKpis(bets, strat());

    expect(kpis.betCount).toBe(3);
    expect(kpis.noResultBets).toBe(2);
    expect(kpis.hitRate).toBe(100); // 1 WON / 1 résolu — pas 1/3
    expect(kpis.roiPct).toBe(50); // 5 de profit / 10 misés (NO_RESULT non misé)
    expect(
      staked
        .filter((b) => b.outcome === 'NO_RESULT')
        .every((b) => b.profit === 0),
    ).toBe(true);
    expect(kpis.finalBankroll).toBe(105);
  });

  it('PERCENT_BANKROLL : la mise suit la bankroll courante, ordre chronologique', () => {
    const bets = [
      bet({
        outcome: 'WON',
        oddAtDecision: 2.0,
        decisionAt: new Date('2026-03-06T20:00:00Z'),
      }), // mise 10 (10% de 100) → +10 → bankroll 110
      bet({
        outcome: 'LOST',
        fixtureId: 'f2',
        decisionAt: new Date('2026-03-06T21:00:00Z'),
      }), // mise 11 (10% de 110) → -11 → bankroll 99
    ];

    const { staked, kpis } = applyStakingAndComputeKpis(
      bets,
      strat({ staking: { type: 'PERCENT_BANKROLL', amount: 10 } }),
    );

    expect(staked[0].stake).toBe(10);
    expect(staked[1].stake).toBe(11);
    expect(kpis.finalBankroll).toBe(99);
  });

  it('trie par decisionAt même si les paris arrivent désordonnés', () => {
    const late = bet({
      outcome: 'LOST',
      fixtureId: 'f2',
      decisionAt: new Date('2026-03-06T22:00:00Z'),
    });
    const early = bet({ decisionAt: new Date('2026-03-06T20:00:00Z') });

    const { staked } = applyStakingAndComputeKpis(
      [late, early],
      strat({ staking: { type: 'PERCENT_BANKROLL', amount: 10 } }),
    );

    expect(staked[0].decisionAt).toEqual(early.decisionAt);
  });

  it('drawdown max mesuré depuis le pic de bankroll', () => {
    const bets = [
      bet({
        outcome: 'WON',
        oddAtDecision: 2.0,
        decisionAt: new Date('2026-03-06T20:00:00Z'),
      }), // 110
      bet({
        outcome: 'LOST',
        fixtureId: 'f2',
        decisionAt: new Date('2026-03-06T21:00:00Z'),
      }), // 100
      bet({
        outcome: 'LOST',
        fixtureId: 'f3',
        decisionAt: new Date('2026-03-06T22:00:00Z'),
      }), // 90
    ];

    const { kpis } = applyStakingAndComputeKpis(bets, strat());

    // pic 110 → creux 90 → drawdown (110-90)/110 = 18.18 %
    expect(kpis.maxDrawdownPct).toBe(18.18);
  });

  it('ventile le yield par marché', () => {
    const bets = [
      bet({ marketType: 'Buts match', outcome: 'WON', oddAtDecision: 2.0 }),
      bet({
        marketType: 'Buts 2ème mi-temps',
        fixtureId: 'f2',
        outcome: 'LOST',
      }),
    ];

    const { kpis } = applyStakingAndComputeKpis(bets, strat());

    expect(kpis.yieldByMarket['Buts match']).toEqual({
      bets: 1,
      roiPct: 100,
      hitRate: 100,
    });
    expect(kpis.yieldByMarket['Buts 2ème mi-temps']).toEqual({
      bets: 1,
      roiPct: -100,
      hitRate: 0,
    });
  });

  it('aucun pari → KPIs neutres, bankroll intacte', () => {
    const { kpis } = applyStakingAndComputeKpis([], strat());

    expect(kpis.betCount).toBe(0);
    expect(kpis.hitRate).toBe(0);
    expect(kpis.roiPct).toBe(0);
    expect(kpis.finalBankroll).toBe(100);
  });
});
