import {
  applyStakingAndComputeKpis,
  summarizeSignals,
} from './kpis-calculator';
import { BacktestStrategy, DecidedBet, SignalRecord } from './backtest.types';

function strat(overrides: Partial<BacktestStrategy> = {}): BacktestStrategy {
  return {
    name: 't',
    version: '1',
    entryRules: {} as BacktestStrategy['entryRules'],
    markets: [],
    minEdgePct: 0,
    minConfidence: 0,
    staking: { type: 'FLAT', amount: 10 },
    odds: { source: ['ODDS_SNAPSHOT'], executionLatencyMs: 0 },
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
    quotedOdd: 2.0,
    oddSource: 'ODDS_SNAPSHOT',
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

  it('VOID (match annulé) : mise rendue, hors hit-rate, ROI, mise totale et marché, comme la simulation', () => {
    const bets = [
      bet({ outcome: 'WON', oddAtDecision: 1.5 }), // +5
      bet({ outcome: 'VOID', fixtureId: 'f2', edgePct: 99 }),
      bet({ outcome: 'LOST', fixtureId: 'f3' }), // -10
    ];

    const { staked, kpis } = applyStakingAndComputeKpis(bets, strat());

    expect(staked.find((b) => b.outcome === 'VOID')).toMatchObject({
      placed: true,
      stake: 10,
      profit: 0,
    });
    expect(kpis.voidBets).toBe(1);
    expect(kpis.betCount).toBe(3);
    expect(kpis.hitRate).toBe(50);
    expect(kpis.totalStaked).toBe(20);
    expect(kpis.roiPct).toBe(-25);
    expect(kpis.finalBankroll).toBe(95);
    expect(kpis.avgRealizedEdgePct).toBe(10);
    expect(kpis.yieldByMarket['Buts match']).toEqual({
      bets: 3,
      roiPct: -25,
      hitRate: 50,
    });
    expect(kpis.roiCi95).not.toBeNull();
  });

  it('VOID n’affecte ni la bankroll ni le drawdown', () => {
    const { kpis } = applyStakingAndComputeKpis(
      [bet({ outcome: 'VOID' }), bet({ outcome: 'VOID', fixtureId: 'f2' })],
      strat(),
    );
    expect(kpis).toMatchObject({
      voidBets: 2,
      totalStaked: 0,
      roiPct: 0,
      hitRate: 0,
      maxDrawdownPct: 0,
      finalBankroll: 100,
      roiCi95: null,
    });
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

  describe('valeurs limites de bankroll', () => {
    it('bankroll initiale nulle : aucun pari placé, aucun profit', () => {
      const { staked, kpis } = applyStakingAndComputeKpis(
        [bet(), bet({ fixtureId: 'f2', outcome: 'LOST' })],
        strat({ bankroll: 0 }),
      );

      expect(staked.every((b) => !b.placed && b.stake === 0)).toBe(true);
      expect(kpis.betCount).toBe(0);
      expect(kpis.bankrollSkippedBets).toBe(2);
      expect(kpis.finalBankroll).toBe(0);
      expect(kpis.roiPct).toBe(0);
    });

    it('mise FLAT plafonnée à la bankroll restante, jamais de solde négatif', () => {
      const { staked, kpis } = applyStakingAndComputeKpis(
        [
          bet({
            outcome: 'LOST',
            decisionAt: new Date('2026-03-06T20:00:00Z'),
          }), // 100 → 30
          bet({
            fixtureId: 'f2',
            outcome: 'LOST',
            decisionAt: new Date('2026-03-06T21:00:00Z'),
          }), // mise plafonnée à 30 → 0
          bet({
            fixtureId: 'f3',
            outcome: 'WON',
            decisionAt: new Date('2026-03-06T22:00:00Z'),
          }), // bankroll épuisée → non placé
        ],
        strat({ staking: { type: 'FLAT', amount: 70 } }),
      );

      expect(staked.map((b) => b.stake)).toEqual([70, 30, 0]);
      expect(staked[2].placed).toBe(false);
      expect(kpis.finalBankroll).toBe(0);
      expect(kpis.maxDrawdownPct).toBe(100);
      expect(kpis.bankrollSkippedBets).toBe(1);
      expect(kpis.betCount).toBe(2);
    });

    it('bankroll négative en entrée traitée comme nulle', () => {
      const { kpis } = applyStakingAndComputeKpis(
        [bet()],
        strat({ bankroll: -50 }),
      );

      expect(kpis.finalBankroll).toBe(0);
      expect(kpis.bankrollSkippedBets).toBe(1);
    });
  });

  it('mesure le slippage entre cote de décision et cote prise', () => {
    const { kpis } = applyStakingAndComputeKpis(
      [
        bet({ quotedOdd: 2.0, oddAtDecision: 1.9 }), // -5 %
        bet({ fixtureId: 'f2', quotedOdd: 2.0, oddAtDecision: 2.0 }), // 0 %
      ],
      strat(),
    );

    expect(kpis.avgSlippagePct).toBe(-2.5);
  });

  it('intervalle de confiance 95 % du rendement unitaire, absent sous 2 paris', () => {
    expect(
      applyStakingAndComputeKpis([bet()], strat()).kpis.roiCi95,
    ).toBeNull();

    // rendements unitaires +1, -1, +1, -1 : moyenne 0, écart-type ~1.1547
    const bets = [
      bet({ decisionAt: new Date('2026-03-06T20:00:00Z') }),
      bet({
        fixtureId: 'f2',
        outcome: 'LOST',
        decisionAt: new Date('2026-03-06T21:00:00Z'),
      }),
      bet({ fixtureId: 'f3', decisionAt: new Date('2026-03-06T22:00:00Z') }),
      bet({
        fixtureId: 'f4',
        outcome: 'LOST',
        decisionAt: new Date('2026-03-06T23:00:00Z'),
      }),
    ];
    const { kpis } = applyStakingAndComputeKpis(bets, strat());

    expect(kpis.roiPct).toBe(0);
    expect(kpis.roiCi95).toEqual({ lowPct: -113.16, highPct: 113.16 });
  });

  it('expose mise totale et profit net', () => {
    const { kpis } = applyStakingAndComputeKpis(
      [bet({ oddAtDecision: 1.5 }), bet({ fixtureId: 'f2', outcome: 'LOST' })],
      strat(),
    );

    expect(kpis.totalStaked).toBe(20);
    expect(kpis.netProfit).toBe(-5);
  });
});

describe('summarizeSignals()', () => {
  const signal = (stage: SignalRecord['stage']): SignalRecord => ({
    fixtureId: 'f1',
    marketType: 'Buts match',
    firstSignalAt: new Date('2026-03-06T20:00:00Z'),
    stage,
  });

  it('compte chaque absence de cote et calcule la couverture', () => {
    const accounting = summarizeSignals([
      signal('PLACED'),
      signal('PLACED'),
      signal('NO_QUOTE_AT_DECISION'),
      signal('NO_QUOTE_AT_EXECUTION'),
      signal('BELOW_MIN_ODD_AT_DECISION'),
      signal('BELOW_MIN_ODD_AT_EXECUTION'),
      signal('PLACED'),
      signal('PLACED'),
    ]);

    expect(accounting).toEqual({
      signals: 8,
      noQuoteAtDecision: 1,
      belowMinOddAtDecision: 1,
      noQuoteAtExecution: 1,
      belowMinOddAtExecution: 1,
      placed: 4,
      oddsCoveragePct: 75,
    });
  });

  it('couverture nulle (et non 100 %) quand aucun signal', () => {
    expect(summarizeSignals([]).oddsCoveragePct).toBeNull();
  });
});
