import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { baselineStrategy } from '../backtest/baseline.strategy';
import { BacktestStrategy } from '../backtest/backtest.types';
import { JsonLogger } from '../common/json.logger';
import { BetDecision } from '../database/entities/bet-decision.entity';
import { ALL_ENTITIES } from '../database/entities';
import { Fixture } from '../database/entities/fixture.entity';
import { OddsSnapshot } from '../database/entities/odds-snapshot.entity';
import { SimulationRun } from '../database/entities/simulation-run.entity';
import { fromCents, toCents } from '../execution/execution.types';
import { ExecutableQuoteService } from '../odds/executable-quote.service';
import { ExecutableQuote } from '../odds/odds.types';
import {
  LiveSignal,
  SmartSuggestionsService,
} from '../recommendations/smart-suggestions.service';
import {
  BankrollState,
  bankrollFromJournal,
  decisionKeyOf,
  decodeCursor,
  encodeCursor,
  NO_RESULT_AFTER_MS,
  planExecution,
  planNewDecisions,
  planSettlement,
  QuoteSelector,
  signalKeyOf,
  SimulationContext,
  SimulationService,
  summarizeJournal,
} from './simulation.service';

const T0 = new Date('2026-10-10T15:25:00.000Z');
const RUN_ID = '11111111-1111-4111-8111-111111111111';

function strategy(overrides: Partial<BacktestStrategy> = {}): BacktestStrategy {
  return {
    ...structuredClone(baselineStrategy()),
    staking: { type: 'FLAT', amount: 10 },
    bankroll: 100,
    ...overrides,
  };
}

function context(
  overrides: Partial<SimulationContext['risk']> = {},
  strat: BacktestStrategy = strategy(),
): SimulationContext {
  return {
    runId: RUN_ID,
    currency: 'EUR',
    strategy: strat,
    risk: {
      maxQuoteAgeMs: 120_000,
      executionLatencyMs: 30_000,
      bookmakerKey: null,
      maxStakePerBet: null,
      maxOpenExposure: null,
      ...overrides,
    },
  };
}

function signal(index = 1, overrides: Partial<LiveSignal> = {}): LiveSignal {
  return {
    id: `smart-fh-${index}`,
    fixtureId: `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, '0')}`,
    fixtureLabel: 'Domicile vs Extérieur',
    providerFixtureId: String(500 + index),
    quoteTarget: {
      providerFixtureId: String(500 + index),
      marketKey: 'TEAM_GOALS_FT',
      selectionKey: 'HOME_OVER_0.5',
    },
    marketType: 'Buts match',
    selection: 'Domicile marque dans le match (+0.5)',
    minAcceptableOdd: 1.35,
    edgePct: 8,
    confidenceScore: null,
    baseRateSampleSize: null,
    reasons: [],
    riskFlags: [],
    status: 'NEW',
    ruleName: 'shots-pressure',
    elapsed: 25,
    shotsCount: 12,
    teamId: 10,
    teamName: 'Domicile',
    isHomeTeam: true,
    ...overrides,
  };
}

function quote(overrides: Partial<ExecutableQuote> = {}): ExecutableQuote {
  return {
    snapshotId: 'q-1',
    providerKey: 'apifootball',
    fixtureId: 'f',
    providerFixtureId: '501',
    bookmakerKey: 'bet365',
    marketKey: 'TEAM_GOALS_FT',
    selectionKey: 'HOME_OVER_0.5',
    oddValue: 1.8,
    observedAt: new Date(T0.getTime() - 1_000),
    receivedAt: new Date(T0.getTime() - 500),
    available: true,
    ...overrides,
  };
}

const always =
  (q: ExecutableQuote | null): QuoteSelector =>
  () =>
    q;

function bankroll(
  availableCents = 10_000,
  openExposureCents = 0,
): BankrollState {
  return {
    initialCents: 10_000,
    realizedProfitCents: 0,
    openExposureCents,
    availableCents,
  };
}

function asRow(
  decision: ReturnType<typeof planNewDecisions>[number],
  id = 'bbbbbbbb-0000-4000-8000-000000000001',
): BetDecision {
  return { ...decision, id, createdAt: decision.decidedAt } as BetDecision;
}

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: signal().fixtureId,
    statusShort: 'FT',
    scoreHome: 1,
    scoreAway: 0,
    raw: { score: { halftime: { home: 0, away: 0 } } },
    ...overrides,
  } as unknown as Fixture;
}

describe('montants en centimes', () => {
  it('convertit sans passer par un float', () => {
    expect(toCents('0.10') + toCents('0.20')).toBe(30);
    expect(fromCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
    expect(toCents('12.3')).toBe(1230);
    expect(toCents('-5.00')).toBe(-500);
    expect(fromCents(-5)).toBe('-0.05');
  });

  it('refuse un montant mal formé', () => {
    expect(() => toCents('1.234')).toThrow();
    expect(() => toCents('abc')).toThrow();
    expect(() => fromCents(0.5)).toThrow();
  });
});

describe('planNewDecisions()', () => {
  it('décision sans cote : rejet NO_EXECUTABLE_ODD journalisé', () => {
    const rows = planNewDecisions(
      [signal()],
      context(),
      [],
      bankroll(),
      always(null),
      T0,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'REJECTED',
      rejectionCode: 'NO_EXECUTABLE_ODD',
      stake: null,
      decisionOdd: null,
      decidedAt: T0,
    });
  });

  it('cote observée sous le minimum : rejet BELOW_MIN_ODD avec la cote copiée', () => {
    const [row] = planNewDecisions(
      [signal()],
      context(),
      [],
      bankroll(),
      always(quote({ oddValue: 1.2 })),
      T0,
    );

    expect(row).toMatchObject({
      status: 'REJECTED',
      rejectionCode: 'BELOW_MIN_ODD',
      decisionOdd: 1.2,
      decisionOddsSnapshotId: 'q-1',
    });
  });

  it('ordre virtuel accepté : mise réservée, cote copiée, exécution différée de la latence', () => {
    const state = bankroll();
    const [row] = planNewDecisions(
      [signal()],
      context(),
      [],
      state,
      always(quote()),
      T0,
    );

    expect(row).toMatchObject({
      status: 'ORDER_RESERVED',
      rejectionCode: null,
      stake: '10.00',
      currency: 'EUR',
      decisionOdd: 1.8,
      decisionBookmakerKey: 'bet365',
      executionDueAt: new Date(T0.getTime() + 30_000),
    });
    expect(row.idempotencyKey).toBe(
      decisionKeyOf(RUN_ID, signalKeyOf(RUN_ID, signal()), 'ORDER:0'),
    );
    expect(state).toMatchObject({
      availableCents: 9_000,
      openExposureCents: 1_000,
    });
  });

  it('même entrée → mêmes clés : un signal répété dans un tick ou rejoué ne crée rien de plus', () => {
    const first = planNewDecisions(
      [signal(), signal()],
      context(),
      [],
      bankroll(),
      always(quote()),
      T0,
    );
    const replay = planNewDecisions(
      [signal()],
      context(),
      [],
      bankroll(),
      always(quote()),
      new Date(T0.getTime() + 30_000),
    );

    expect(first).toHaveLength(1);
    expect(replay[0].idempotencyKey).toBe(first[0].idempotencyKey);
  });

  it('ne redécide pas un signal déjà réservé ou réglé', () => {
    const key = signalKeyOf(RUN_ID, signal());
    for (const status of ['ORDER_RESERVED', 'COMPLETED'] as const) {
      const rows = planNewDecisions(
        [signal()],
        context(),
        [{ signalKey: key, status, stake: '10.00', idempotencyKey: 'x' }],
        bankroll(),
        always(quote()),
        T0,
      );
      expect(rows).toEqual([]);
    }
  });

  it('un rejet déjà journalisé pour le même motif n’est pas réécrit', () => {
    const key = signalKeyOf(RUN_ID, signal());
    const rows = planNewDecisions(
      [signal()],
      context(),
      [
        {
          signalKey: key,
          status: 'REJECTED',
          stake: null,
          idempotencyKey: decisionKeyOf(
            RUN_ID,
            key,
            'REJECTED:NO_EXECUTABLE_ODD',
          ),
        },
      ],
      bankroll(),
      always(null),
      T0,
    );

    expect(rows).toEqual([]);
  });

  it('retente un signal après un ordre rejeté à l’exécution, avec une nouvelle clé', () => {
    const key = signalKeyOf(RUN_ID, signal());
    const [row] = planNewDecisions(
      [signal()],
      context(),
      [
        {
          signalKey: key,
          status: 'REJECTED',
          stake: '10.00',
          idempotencyKey: decisionKeyOf(RUN_ID, key, 'ORDER:0'),
        },
      ],
      bankroll(),
      always(quote()),
      T0,
    );

    expect(row.status).toBe('ORDER_RESERVED');
    expect(row.idempotencyKey).toBe(decisionKeyOf(RUN_ID, key, 'ORDER:1'));
  });

  describe('limite de bankroll', () => {
    it('plafonne la mise à la bankroll restante, puis rejette LIMIT_EXCEEDED', () => {
      const ctx = context(
        {},
        strategy({ staking: { type: 'FLAT', amount: 60 } }),
      );
      const rows = planNewDecisions(
        [signal(1), signal(2), signal(3)],
        ctx,
        [],
        bankroll(),
        always(quote()),
        T0,
      );
      const stakes = rows.map((r) => [r.status, r.stake, r.rejectionCode]);

      expect(stakes).toEqual(
        expect.arrayContaining([
          ['ORDER_RESERVED', '60.00', null],
          ['ORDER_RESERVED', '40.00', null],
          ['REJECTED', null, 'LIMIT_EXCEEDED'],
        ]),
      );
      const reserved = rows
        .filter((r) => r.status === 'ORDER_RESERVED')
        .reduce((sum, r) => sum + toCents(r.stake!), 0);
      expect(reserved).toBeLessThanOrEqual(10_000);
    });

    it('bankroll nulle ou négative : aucun ordre', () => {
      for (const available of [0, -500]) {
        const [row] = planNewDecisions(
          [signal()],
          context(),
          [],
          bankroll(available),
          always(quote()),
          T0,
        );
        expect(row.rejectionCode).toBe('LIMIT_EXCEEDED');
      }
    });

    it('respecte le plafond par pari et l’exposition ouverte maximale', () => {
      const [capped] = planNewDecisions(
        [signal()],
        context({ maxStakePerBet: '4.50' }),
        [],
        bankroll(),
        always(quote()),
        T0,
      );
      expect(capped.stake).toBe('4.50');

      const [blocked] = planNewDecisions(
        [signal()],
        context({ maxOpenExposure: '25.00' }),
        [],
        bankroll(7_500, 2_500),
        always(quote()),
        T0,
      );
      expect(blocked.rejectionCode).toBe('LIMIT_EXCEEDED');
    });

    it('PERCENT_BANKROLL : arrondi au centime inférieur, jamais au-dessus', () => {
      const ctx = context(
        {},
        strategy({ staking: { type: 'PERCENT_BANKROLL', amount: 3.33 } }),
      );
      const [row] = planNewDecisions(
        [signal()],
        ctx,
        [],
        bankroll(10_001),
        always(quote()),
        T0,
      );
      expect(row.stake).toBe('3.33');
    });
  });

  it('applique les filtres de la stratégie figée (marchés, edge, confiance)', () => {
    const ctx = context(
      {},
      strategy({ markets: ['Buts 2ème mi-temps'], minEdgePct: 0 }),
    );
    expect(
      planNewDecisions([signal()], ctx, [], bankroll(), always(quote()), T0),
    ).toEqual([]);

    const strict = context({}, strategy({ minEdgePct: 50 }));
    expect(
      planNewDecisions([signal()], strict, [], bankroll(), always(quote()), T0),
    ).toEqual([]);

    const confident = context({}, strategy({ minConfidence: 60 }));
    expect(
      planNewDecisions(
        [signal()],
        confident,
        [],
        bankroll(),
        always(quote()),
        T0,
      ),
    ).toEqual([]);
  });

  it('restreint la cote au bookmaker de la politique', () => {
    const select = jest.fn().mockReturnValue(quote());
    planNewDecisions(
      [signal()],
      context({ bookmakerKey: 'pinnacle' }),
      [],
      bankroll(),
      select,
      T0,
    );

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ bookmakerKey: 'pinnacle' }),
      T0,
    );
  });
});

describe('planExecution()', () => {
  const reserved = () =>
    asRow(
      planNewDecisions(
        [signal()],
        context(),
        [],
        bankroll(),
        always(quote()),
        T0,
      )[0],
    );
  const due = new Date(T0.getTime() + 30_000);

  it('attend l’échéance de latence', () => {
    expect(
      planExecution(reserved(), always(quote()), new Date(due.getTime() - 1)),
    ).toBeNull();
  });

  it('cherche la cote à T + latence chez le même bookmaker', () => {
    const select = jest
      .fn()
      .mockReturnValue(quote({ snapshotId: 'q-2', oddValue: 1.71 }));
    const update = planExecution(reserved(), select, due);

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmakerKey: 'bet365',
        providerKey: 'apifootball',
      }),
      due,
    );
    expect(update).toMatchObject({
      executableOdd: 1.71,
      executableOddsSnapshotId: 'q-2',
      slippagePct: -5,
      executedAt: due,
    });
    expect(update).not.toHaveProperty('status');
  });

  it('cote déplacée sous le minimum : ordre virtuel refusé ODD_MOVED', () => {
    expect(
      planExecution(reserved(), always(quote({ oddValue: 1.3 })), due),
    ).toMatchObject({
      status: 'REJECTED',
      rejectionCode: 'ODD_MOVED',
      executableOdd: 1.3,
    });
  });

  it('aucune cote à l’exécution : ordre virtuel refusé NO_EXECUTABLE_ODD', () => {
    expect(planExecution(reserved(), always(null), due)).toMatchObject({
      status: 'REJECTED',
      rejectionCode: 'NO_EXECUTABLE_ODD',
    });
  });
});

describe('planSettlement()', () => {
  const executed = (odd = 1.85) => {
    const row = asRow(
      planNewDecisions(
        [signal()],
        context(),
        [],
        bankroll(),
        always(quote()),
        T0,
      )[0],
    );
    return Object.assign(row, { executableOdd: odd, executedAt: T0 });
  };

  it('gain au centime près, sans float', () => {
    expect(planSettlement(executed(1.85), fixture(), T0)).toMatchObject({
      status: 'COMPLETED',
      outcome: 'WON',
      profit: '8.50',
    });
  });

  it('perte de la mise', () => {
    expect(
      planSettlement(executed(), fixture({ scoreHome: 0 }), T0),
    ).toMatchObject({ outcome: 'LOST', profit: '-10.00' });
  });

  it('match annulé : VOID, mise rendue', () => {
    expect(
      planSettlement(
        executed(),
        fixture({ statusShort: 'CANC', scoreHome: 0 }),
        T0,
      ),
    ).toMatchObject({ outcome: 'VOID', profit: '0.00' });
  });

  it('match non résolu : rien avant 24 h, NO_RESULT ensuite (mise rendue)', () => {
    const live = fixture({ statusShort: '2H', scoreHome: 0 });
    expect(planSettlement(executed(), live, T0)).toBeNull();
    expect(
      planSettlement(
        executed(),
        undefined,
        new Date(T0.getTime() + NO_RESULT_AFTER_MS),
      ),
    ).toMatchObject({ outcome: 'NO_RESULT', profit: '0.00' });
  });

  it('ne règle jamais un ordre non exécuté', () => {
    const row = asRow(
      planNewDecisions(
        [signal()],
        context(),
        [],
        bankroll(),
        always(quote()),
        T0,
      )[0],
    );
    expect(planSettlement(row, fixture(), T0)).toBeNull();
  });
});

describe('summarizeJournal()', () => {
  function journal(): BetDecision[] {
    const make = (id: number, overrides: Partial<BetDecision>): BetDecision =>
      ({
        id: `cccccccc-0000-4000-8000-${String(id).padStart(12, '0')}`,
        signalKey: `s${id}`,
        decidedAt: new Date(T0.getTime() + id * 60_000),
        status: 'COMPLETED',
        rejectionCode: null,
        stake: '10.00',
        decisionOdd: 2,
        executableOdd: 2,
        slippagePct: 0,
        executedAt: new Date(T0.getTime() + id * 60_000 + 30_000),
        outcome: 'WON',
        profit: '10.00',
        settledAt: new Date(T0.getTime() + id * 3_600_000),
        ...overrides,
      }) as BetDecision;
    return [
      make(1, {}), // +10 → 110
      make(2, { outcome: 'LOST', profit: '-10.00' }), // 100
      make(3, {
        outcome: 'LOST',
        profit: '-10.00',
        executableOdd: 1.9,
        slippagePct: -5,
      }), // 90
      make(4, { outcome: 'VOID', profit: '0.00' }),
      make(5, {
        status: 'ORDER_RESERVED',
        outcome: null,
        profit: null,
        settledAt: null,
      }),
      make(6, {
        status: 'REJECTED',
        rejectionCode: 'NO_EXECUTABLE_ODD',
        stake: null,
        decisionOdd: null,
        executableOdd: null,
        executedAt: null,
        outcome: null,
        profit: null,
        settledAt: null,
      }),
      make(7, {
        signalKey: 's6',
        status: 'REJECTED',
        rejectionCode: 'BELOW_MIN_ODD',
        stake: null,
        executableOdd: null,
        executedAt: null,
        outcome: null,
        profit: null,
        settledAt: null,
      }),
      make(8, {
        status: 'REJECTED',
        rejectionCode: 'NO_EXECUTABLE_ODD',
        stake: null,
        decisionOdd: null,
        executableOdd: null,
        executedAt: null,
        outcome: null,
        profit: null,
        settledAt: null,
      }),
    ];
  }

  const run = {
    id: RUN_ID,
    status: 'RUNNING' as const,
    currency: 'EUR',
    initialBankroll: '100.00',
    riskSnapshot: context().risk,
  };

  it('agrégats identiques à un recalcul indépendant du journal', () => {
    const rows = journal();
    const summary = summarizeJournal(run, rows);

    const completed = rows.filter((r) => r.status === 'COMPLETED');
    const realized = completed.reduce((s, r) => s + toCents(r.profit!), 0);
    const open = rows
      .filter((r) => r.status === 'ORDER_RESERVED')
      .reduce((s, r) => s + toCents(r.stake!), 0);

    expect(summary.pnl.realized).toBe(fromCents(realized));
    expect(summary.bankroll.openExposure).toBe(fromCents(open));
    expect(summary.bankroll.available).toBe(
      fromCents(10_000 + realized - open),
    );
    expect(summary.bankroll).toEqual(
      expect.objectContaining({
        initial: '100.00',
        equity: '90.00',
        available: '80.00',
      }),
    );
    expect(summary.decisions.total).toBe(rows.length);
    expect(
      Object.values(summary.decisions.byStatus).reduce((a, b) => a + b, 0),
    ).toBe(rows.length);
    expect(summary.decisions.rejectionsByCode).toEqual({
      NO_EXECUTABLE_ODD: 2,
      BELOW_MIN_ODD: 1,
    });
    expect(summary.settled).toEqual({
      total: 4,
      won: 1,
      lost: 2,
      void: 1,
      noResult: 0,
    });
    expect(summary.pnl.turnover).toBe('30.00'); // VOID exclu
    expect(summary.roiPct).toBe(-33.33);
    expect(summary.hitRatePct).toBe(33.33);
    expect(summary.maxDrawdownPct).toBe(18.18); // pic 110 → 90
    expect(summary.avgSlippagePct).toBe(-1);
    expect(summary.latency).toEqual({
      configuredMs: 30_000,
      avgObservedMs: 30_000,
    });
    // s6 a une cote (rejet sous minimum) malgré un premier rejet sans cote ; s8 n'en a jamais eu
    expect(summary.signals).toEqual({
      total: 7,
      withExecutableOdd: 6,
      coveragePct: 85.71,
    });
  });

  it('la bankroll du journal est celle utilisée pour décider', () => {
    const rows = journal();
    expect(bankrollFromJournal('100.00', rows)).toEqual({
      initialCents: 10_000,
      realizedProfitCents: -1_000,
      openExposureCents: 1_000,
      availableCents: 8_000,
    });
  });

  it('journal vide : aucun ratio inventé', () => {
    const summary = summarizeJournal(run, []);
    expect(summary).toMatchObject({
      hitRatePct: null,
      roiPct: null,
      avgSlippagePct: null,
      signals: { total: 0, coveragePct: null },
    });
  });
});

describe('curseur de pagination', () => {
  it('fait l’aller-retour et refuse un curseur forgé', () => {
    const row = { decidedAt: T0, id: 'cccccccc-0000-4000-8000-000000000001' };
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
    expect(() => decodeCursor('bm9u')).toThrow();
    expect(() =>
      decodeCursor(Buffer.from('["x","y"]').toString('base64url')),
    ).toThrow();
  });
});

describe('isolement du mode simulation', () => {
  it('aucun fichier du module ne dépend d’un adaptateur réseau ou opérateur', () => {
    const dir = resolve(__dirname);
    const sources = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => readFileSync(join(dir, file), 'utf8'))
      .join('\n');

    expect(sources).not.toMatch(
      /provider-api-football|@nestjs\/axios|HttpService|axios|fetch\(|OperatorPort|placeOrder/,
    );
  });
});

// ── Intégration MySQL (base éphémère, opt-in explicite) ───────────────────────
const databaseUrl = process.env.SIMULATION_MYSQL_INTEGRATION_DB_URL;
const describeWithMysql = databaseUrl ? describe : describe.skip;
const destructiveOptIn = 'api-score-simulation-it';
const ephemeralDatabaseName = 'api_score_simulation_it';

describeWithMysql('SimulationService — MySQL', () => {
  let dataSource: DataSource;
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as JsonLogger;

  function service(signals: () => LiveSignal[]): SimulationService {
    const suggestions = {
      evaluateLiveSignals: jest.fn(async () => signals()),
    } as unknown as SmartSuggestionsService;
    return new SimulationService(
      dataSource.getRepository(SimulationRun),
      dataSource.getRepository(BetDecision),
      dataSource,
      suggestions,
      new ExecutableQuoteService(dataSource.getRepository(OddsSnapshot)),
      logger,
    );
  }

  async function seedFixture(
    index: number,
    overrides: Record<string, unknown> = {},
  ) {
    const s = signal(index);
    await dataSource.query(
      `INSERT INTO fixtures (id, providerFixtureId, raw, homeTeamId, awayTeamId, statusShort, scoreHome, scoreAway)
       VALUES (?, ?, ?, 10, 20, ?, ?, 0)`,
      [
        s.fixtureId,
        s.providerFixtureId,
        JSON.stringify({ score: { halftime: { home: 0, away: 0 } } }),
        overrides.statusShort ?? '1H',
        overrides.scoreHome ?? 0,
      ],
    );
  }

  async function seedQuote(index: number, at: Date, odd = 1.8) {
    const s = signal(index);
    await dataSource.query(
      `INSERT INTO odds_snapshots (id, fixtureId, providerFixtureId, bookmakerName, marketType, outcome,
         oddValue, impliedProbabilityRaw, phase, provider_key, bookmaker_key, market_key, selection_key,
         observed_at, received_at, available, capturedAt)
       VALUES (UUID(), ?, ?, 'Bet365', 'TEAM_GOALS_FT', 'HOME_OVER_0.5', ?, 0.5, 'LIVE', 'apifootball',
         'bet365', 'TEAM_GOALS_FT', 'HOME_OVER_0.5', ?, ?, 1, ?)`,
      [
        s.fixtureId,
        s.providerFixtureId,
        odd,
        new Date(at.getTime() - 1_000),
        new Date(at.getTime() - 500),
        at,
      ],
    );
  }

  async function startRun(svc: SimulationService, key: string, amount = 10) {
    return svc.start(
      {
        idempotencyKey: key,
        name: 'it',
        strategyVersion: 'it-1',
        strategy: strategy({ staking: { type: 'FLAT', amount } }),
        currency: 'EUR',
        initialBankroll: '100.00',
        maxQuoteAgeMs: 120_000,
        executionLatencyMs: 30_000,
      },
      null,
    );
  }

  const decisionsOf = (runId: string) =>
    dataSource
      .getRepository(BetDecision)
      .find({ where: { simulationRunId: runId } });

  beforeAll(async () => {
    if (
      process.env.SIMULATION_MYSQL_INTEGRATION_DESTRUCTIVE !== destructiveOptIn
    ) {
      throw new Error(
        `Refus d'opération destructive sans SIMULATION_MYSQL_INTEGRATION_DESTRUCTIVE=${destructiveOptIn}`,
      );
    }
    const admin = new DataSource({ type: 'mysql', url: databaseUrl });
    await admin.initialize();
    const [{ name }] = (await admin.query(
      'SELECT DATABASE() AS name',
    )) as Array<{ name: string }>;
    if (name !== ephemeralDatabaseName) {
      await admin.destroy();
      throw new Error(
        `Refus d'opération destructive hors de ${ephemeralDatabaseName}`,
      );
    }
    await admin.query(`DROP DATABASE ${ephemeralDatabaseName}`);
    await admin.query(`CREATE DATABASE ${ephemeralDatabaseName}`);
    await admin.destroy();

    dataSource = new DataSource({
      type: 'mysql',
      url: databaseUrl,
      entities: ALL_ENTITIES,
      migrations: [join(__dirname, '../database/migrations/*.ts')],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  }, 120_000);

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('double tick simultané : une seule décision', async () => {
    await seedFixture(1);
    await seedQuote(1, T0);
    const run = await startRun(
      service(() => []),
      'it-double-tick',
    );
    const a = service(() => [signal(1)]);
    const b = service(() => [signal(1)]);

    await Promise.all([
      a.tick(run.id, T0),
      b.tick(run.id, T0),
      a.tick(run.id, T0),
    ]);

    const rows = await decisionsOf(run.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'ORDER_RESERVED', stake: '10.00' });
  });

  it('ticks concurrents sur deux signaux : la bankroll n’est jamais dépassée', async () => {
    await seedFixture(2);
    await seedFixture(3);
    await seedQuote(2, T0);
    await seedQuote(3, T0);
    const run = await startRun(
      service(() => []),
      'it-bankroll',
      60,
    );

    await Promise.all([
      service(() => [signal(2)]).tick(run.id, T0),
      service(() => [signal(3)]).tick(run.id, T0),
    ]);

    const rows = await decisionsOf(run.id);
    const reserved = rows.filter((r) => r.status === 'ORDER_RESERVED');
    expect(reserved.map((r) => r.stake).sort()).toEqual(['40.00', '60.00']);
    expect(bankrollFromJournal('100.00', rows).availableCents).toBe(0);
  });

  it('redémarrage après crash : un nouveau processus reprend exécution et règlement sans doublon', async () => {
    await seedFixture(4);
    await seedQuote(4, T0, 1.85);
    const run = await startRun(
      service(() => []),
      'it-crash',
    );

    await service(() => [signal(4)]).tick(run.id, T0);
    // « crash » : l'instance disparaît ; une nouvelle instance reprend depuis la base seule.
    await dataSource.query(
      'UPDATE fixtures SET statusShort = ?, scoreHome = 1 WHERE id = ?',
      ['FT', signal(4).fixtureId],
    );
    const restarted = service(() => [signal(4)]);
    const later = new Date(T0.getTime() + 31_000);
    const report = await restarted.tick(run.id, later);
    await restarted.tick(run.id, later);

    expect(report).toEqual({ decided: 0, executed: 1, settled: 1 });
    const rows = await decisionsOf(run.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'COMPLETED',
      outcome: 'WON',
      executableOdd: 1.85,
      profit: '8.50',
    });

    const summary = await restarted.summary(run.id);
    expect(summary.bankroll.available).toBe(
      fromCents(bankrollFromJournal('100.00', rows).availableCents),
    );
    expect(summary.bankroll.available).toBe('108.50');
  });

  it('arrêt : plus aucune décision, mais les ordres ouverts se règlent', async () => {
    await seedFixture(5);
    await seedFixture(6);
    await seedQuote(5, T0);
    await seedQuote(6, new Date(T0.getTime() + 31_000));
    const run = await startRun(
      service(() => []),
      'it-stop',
    );
    await service(() => [signal(5)]).tick(run.id, T0);

    const stopped = await service(() => []).stop(run.id);
    const again = await service(() => []).stop(run.id);
    expect(again.stoppedAt).toEqual(stopped.stoppedAt);

    await dataSource.query('UPDATE fixtures SET statusShort = ? WHERE id = ?', [
      'CANC',
      signal(5).fixtureId,
    ]);
    const after = service(() => [signal(6)]);
    await after.tick(run.id, new Date(T0.getTime() + 31_000));

    const rows = await decisionsOf(run.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'COMPLETED',
      outcome: 'VOID',
      profit: '0.00',
    });
    expect(await after.activeRunIds()).not.toContain(run.id);
  });

  it('démarrage idempotent : même clé → même run, contenu différent → 409', async () => {
    const svc = service(() => []);
    const [a, b] = await Promise.all([
      startRun(svc, 'it-start'),
      startRun(svc, 'it-start'),
    ]);
    expect(a.id).toBe(b.id);
    await expect(startRun(svc, 'it-start', 25)).rejects.toThrow(
      ConflictException,
    );
    const count = await dataSource
      .getRepository(SimulationRun)
      .countBy({ idempotencyKey: 'it-start' });
    expect(count).toBe(1);
  });

  it('pagination par curseur stable et filtrée', async () => {
    const run = await startRun(
      service(() => []),
      'it-pages',
    );
    for (let i = 10; i < 15; i += 1) {
      await seedFixture(i);
      await service(() => [signal(i)]).tick(
        run.id,
        new Date(T0.getTime() + i * 1_000),
      );
    }
    const svc = service(() => []);
    const first = await svc.listDecisions(run.id, { limit: 2 });
    const second = await svc.listDecisions(run.id, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    const third = await svc.listDecisions(run.id, {
      limit: 2,
      cursor: second.nextCursor!,
    });

    const ids = [...first.data, ...second.data, ...third.data].map((d) => d.id);
    expect(new Set(ids).size).toBe(5);
    expect(third.nextCursor).toBeNull();
    expect(first.data[0].decidedAt.getTime()).toBeGreaterThan(
      first.data[1].decidedAt.getTime(),
    );
    const rejected = await svc.listDecisions(run.id, {
      limit: 50,
      status: 'REJECTED',
    });
    expect(
      rejected.data.every((d) => d.rejectionCode === 'NO_EXECUTABLE_ODD'),
    ).toBe(true);
  });
});
