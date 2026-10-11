import { BadRequestException } from '@nestjs/common';
import { DataSource, FindOperator, Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { OddsSnapshot } from '../database/entities/odds-snapshot.entity';
import { WalkForwardFold } from '../database/entities/walk-forward-fold.entity';
import { WalkForwardRun } from '../database/entities/walk-forward-run.entity';
import { ExecutableQuoteService } from '../odds/executable-quote.service';
import { ExecutableQuote } from '../odds/odds.types';
import { BacktestEngineService } from './backtest-engine.service';
import { baselineStrategy } from './baseline.strategy';
import { FoldMetrics, WalkForwardSummary } from './walk-forward.service';
import {
  buildFolds,
  MAX_FOLDS,
  WalkForwardParams,
  WALK_FORWARD_ORPHAN_ERROR,
  WALK_FORWARD_ORPHAN_GRACE_MS,
  WalkForwardService,
  walkForwardLockName,
} from './walk-forward.service';

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

function fixture(index: number): Fixture {
  return {
    id: `fx-${index}`,
    providerFixtureId: String(100 + index),
    homeTeamId: 10,
    awayTeamId: 20,
    homeTeamName: 'Domicile',
    awayTeamName: 'Extérieur',
    statusShort: 'FT',
    scoreHome: 1,
    scoreAway: 0,
    raw: { score: { halftime: { home: 0, away: 0 } } },
  } as unknown as Fixture;
}

/** 12 tirs à 25' pour l'équipe à domicile : déclenche la règle 1MT/match. */
function snapshot(index: number, snapshotAt: Date): FixtureStatsSnapshot {
  return {
    id: `snap-${index}`,
    fixtureId: `fx-${index}`,
    teamId: 10,
    elapsed: 25,
    stats: { statistics: [{ type: 'Total Shots', value: 12 }] },
    snapshotAt,
  } as unknown as FixtureStatsSnapshot;
}

function quote(
  index: number,
  overrides: Partial<ExecutableQuote> = {},
): ExecutableQuote {
  return {
    snapshotId: `quote-${index}`,
    providerKey: 'apifootball',
    fixtureId: `fx-${index}`,
    providerFixtureId: String(100 + index),
    bookmakerKey: 'bet365',
    marketKey: 'TEAM_GOALS_FT',
    selectionKey: 'HOME_OVER_0.5',
    oddValue: 1.8,
    observedAt: new Date(0),
    receivedAt: new Date(0),
    available: true,
    ...overrides,
  };
}

/** Un match par instant ; la cote est observée 1 s avant la décision sauf `futureQuote`. */
interface MatchSpec {
  index: number;
  decisionAt: Date;
  futureQuote?: boolean;
}

function dataset(matches: MatchSpec[]) {
  const fixtures = matches.map((m) => fixture(m.index));
  const snapshots = matches.map((m) => snapshot(m.index, m.decisionAt));
  const quotes = matches.map((m) => {
    const t = m.decisionAt.getTime();
    return m.futureQuote
      ? quote(m.index, {
          observedAt: new Date(t + 500),
          receivedAt: new Date(t + 1_000),
        })
      : quote(m.index, {
          observedAt: new Date(t - 1_000),
          receivedAt: new Date(t - 500),
        });
  });
  return { fixtures, snapshots, quotes };
}

function harness(data: ReturnType<typeof dataset>) {
  const statsWindows: Array<{ start: Date; end: Date }> = [];
  const statsRepo = {
    createQueryBuilder: jest.fn(() => {
      let window = { start: new Date(0), end: new Date(0) };
      const qb = {
        where: jest.fn((_sql: string, params: { start: Date; end: Date }) => {
          window = params;
          statsWindows.push(params);
          return qb;
        }),
        orderBy: jest.fn(() => qb),
        getMany: jest.fn(async () =>
          data.snapshots.filter(
            (s) =>
              s.snapshotAt.getTime() >= window.start.getTime() &&
              s.snapshotAt.getTime() <= window.end.getTime(),
          ),
        ),
      };
      return qb;
    }),
  };
  const fixtureRepo = {
    findBy: jest.fn(async (where: { id: FindOperator<string[]> }) => {
      const ids = where.id.value as unknown as string[];
      return data.fixtures.filter((f) => ids.includes(f.id));
    }),
  };
  const eventRepo = { find: jest.fn(async () => []) };

  const quoteService = new ExecutableQuoteService(
    {} as Repository<OddsSnapshot>,
  );
  const loadCandidates = jest
    .spyOn(quoteService, 'loadCandidates')
    .mockImplementation(async () => data.quotes);

  const logger = { log: jest.fn(), error: jest.fn() } as unknown as JsonLogger;
  const engine = new BacktestEngineService(
    {} as Repository<BacktestRun>,
    {} as Repository<BetResult>,
    fixtureRepo as unknown as Repository<Fixture>,
    statsRepo as unknown as Repository<FixtureStatsSnapshot>,
    eventRepo as unknown as Repository<FixtureEvent>,
    quoteService,
    logger,
  );
  const replaySpy = jest.spyOn(engine, 'replayDetailed');

  const runs = new Map<string, WalkForwardRun>();
  const runRepo = {
    create: jest.fn((value: Partial<WalkForwardRun>) => ({ ...value })),
    save: jest.fn(async (value: WalkForwardRun) => {
      const saved = { ...value, id: `run-${runs.size + 1}` };
      runs.set(saved.id, saved);
      return saved;
    }),
    update: jest.fn(
      async (
        criteria: { id: string; status?: string },
        patch: Partial<WalkForwardRun>,
      ) => {
        const run = runs.get(criteria.id);
        if (!run || (criteria.status && run.status !== criteria.status)) {
          return { affected: 0 };
        }
        Object.assign(run, patch);
        return { affected: 1 };
      },
    ),
    // Simule l'aller-retour JSON de MySQL : l'exécution ne relit que la copie persistée.
    findOneByOrFail: jest.fn(async ({ id }: { id: string }) => {
      const run = runs.get(id)!;
      return {
        ...run,
        strategySnapshot: JSON.parse(JSON.stringify(run.strategySnapshot)),
        config: JSON.parse(JSON.stringify(run.config)),
      };
    }),
    findOneBy: jest.fn(async ({ id }: { id: string }) => runs.get(id) ?? null),
  };

  const folds: Array<Partial<WalkForwardFold>> = [];
  const foldRepo = {
    insert: jest.fn(async (rows: Array<Partial<WalkForwardFold>>) => {
      folds.push(...rows);
    }),
    find: jest.fn(async ({ where }: { where: { runId: string } }) =>
      folds
        .filter((f) => f.runId === where.runId)
        .sort((a, b) => a.foldIndex! - b.foldIndex!),
    ),
  };

  // Verrous nommés MySQL simulés : un nom tenu par une connexion ne peut pas l'être par une autre.
  const heldLocks = new Set<string>();
  const dataSource = {
    query: jest.fn(async () => ({ affectedRows: 0 })),
    createQueryRunner: jest.fn(() => {
      const mine = new Set<string>();
      return {
        connect: jest.fn(async () => undefined),
        release: jest.fn(async () => {
          for (const name of mine) heldLocks.delete(name);
          mine.clear();
        }),
        query: jest.fn(async (sql: string, [name]: string[]) => {
          if (sql.startsWith('SELECT GET_LOCK')) {
            if (heldLocks.has(name)) return [{ acquired: 0 }];
            heldLocks.add(name);
            mine.add(name);
            return [{ acquired: 1 }];
          }
          heldLocks.delete(name);
          mine.delete(name);
          return [{ released: 1 }];
        }),
      };
    }),
  };

  const service = new WalkForwardService(
    runRepo as unknown as Repository<WalkForwardRun>,
    foldRepo as unknown as Repository<WalkForwardFold>,
    engine,
    logger,
    dataSource as unknown as DataSource,
  );
  // L'exécution est déclenchée explicitement par les tests, pas en tâche de fond.
  jest
    .spyOn(global, 'setImmediate')
    .mockImplementation((() => undefined) as never);

  return {
    service,
    heldLocks,
    dataSource,
    logger,
    runs,
    folds,
    foldRepo,
    statsRepo,
    fixtureRepo,
    eventRepo,
    loadCandidates,
    replaySpy,
    statsWindows,
  };
}

function params(overrides: Partial<WalkForwardParams> = {}): WalkForwardParams {
  // Copie profonde : baselineStrategy() partage DEFAULT_CONFIG par référence.
  const strategy = structuredClone(baselineStrategy());
  strategy.markets = ['Buts match'];
  return {
    strategyVersion: 'baseline-1.0.0',
    strategy,
    trainWindowDays: 10,
    validationWindowDays: 5,
    testWindowDays: 5,
    stepDays: 5,
    from: at('2026-01-01T00:00:00.000Z'),
    to: at('2026-02-10T00:00:00.000Z'),
    maxQuoteAgeMs: 120_000,
    executionLatencyMs: 0,
    ...overrides,
  };
}

/** Fold 0 test = [01-16, 01-21[, fold 1 = [01-21, 01-26[, … fold 4 = [02-05, 02-10[. */
const BOUNDARY_MATCHES: MatchSpec[] = [
  { index: 1, decisionAt: at('2026-01-16T00:00:00.000Z') }, // début exact du test du fold 0
  { index: 2, decisionAt: at('2026-01-21T00:00:00.000Z') }, // fin exclue du fold 0 → fold 1
  { index: 3, decisionAt: at('2026-01-27T12:00:00.000Z'), futureQuote: true }, // fold 2
  { index: 4, decisionAt: at('2026-02-06T12:00:00.000Z') }, // fold 4 ; fold 3 vide
];

async function runOnce(
  h: ReturnType<typeof harness>,
  input: WalkForwardParams = params(),
) {
  const { runId } = await h.service.start(input, 'user-1');
  await h.service.execute(runId);
  return (await h.service.getRun(runId))!;
}

const metricsOf = (fold: Partial<WalkForwardFold>) =>
  fold.metrics as unknown as FoldMetrics;

afterEach(() => jest.restoreAllMocks());

describe('buildFolds()', () => {
  it('génère des fenêtres contiguës et des tests disjoints, bornes semi-ouvertes', () => {
    const folds = buildFolds(params());

    expect(folds).toHaveLength(5);
    expect(folds[0]).toMatchObject({
      trainFrom: at('2026-01-01T00:00:00.000Z'),
      trainTo: at('2026-01-11T00:00:00.000Z'),
      validationFrom: at('2026-01-11T00:00:00.000Z'),
      validationTo: at('2026-01-16T00:00:00.000Z'),
      testFrom: at('2026-01-16T00:00:00.000Z'),
      testTo: at('2026-01-21T00:00:00.000Z'),
      complete: true,
    });
    for (let i = 1; i < folds.length; i += 1) {
      expect(folds[i].testFrom.getTime()).toBeGreaterThanOrEqual(
        folds[i - 1].testTo.getTime(),
      );
    }
    expect(folds[4].testTo).toEqual(at('2026-02-10T00:00:00.000Z'));
  });

  it('conserve un unique fold final incomplet', () => {
    const folds = buildFolds(params({ to: at('2026-02-08T00:00:00.000Z') }));

    expect(folds.map((f) => f.complete)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('refuse des tests chevauchants, une plage inversée et un nombre de folds excessif', () => {
    expect(() => buildFolds(params({ stepDays: 4 }))).toThrow(
      BadRequestException,
    );
    expect(() =>
      buildFolds(params({ from: at('2026-02-10T00:00:00.000Z') })),
    ).toThrow(BadRequestException);
    expect(() =>
      buildFolds(
        params({
          trainWindowDays: 1,
          validationWindowDays: 1,
          testWindowDays: 1,
          stepDays: 1,
          to: new Date(
            Date.parse('2026-01-01T00:00:00.000Z') + (MAX_FOLDS + 5) * DAY,
          ),
        }),
      ),
    ).toThrow(BadRequestException);
  });
});

describe('WalkForwardService', () => {
  it('frontière exacte : début de test inclus, fin de test exclue', async () => {
    const h = harness(dataset(BOUNDARY_MATCHES));
    const run = await runOnce(h);

    const [fold0, fold1] = run.folds;
    expect(metricsOf(fold0).test.signals.signals).toBe(1);
    expect(metricsOf(fold0).test.kpis.betCount).toBe(1);
    expect(metricsOf(fold0).validation.signals.signals).toBe(0);
    expect(metricsOf(fold1).test.signals.signals).toBe(1);
    expect(metricsOf(fold1).test.kpis.betCount).toBe(1);
  });

  it('ignore une cote reçue après la décision et la compte comme absence de cote', async () => {
    const h = harness(dataset(BOUNDARY_MATCHES));
    const run = await runOnce(h);

    const fold2 = run.folds[2];
    expect(metricsOf(fold2).test.kpis.betCount).toBe(0);
    expect(metricsOf(fold2).test.signals).toMatchObject({
      signals: 1,
      noQuoteAtDecision: 1,
      oddsCoveragePct: 0,
    });
    expect(fold2.status).toBe('INELIGIBLE');
    expect(fold2.ineligibilityReason).toBe('INSUFFICIENT_ODDS_COVERAGE');
  });

  it('ne lit aucune donnée de stats au-delà de la plage du run', async () => {
    const data = dataset([
      ...BOUNDARY_MATCHES,
      { index: 9, decisionAt: at('2026-02-10T00:00:00.001Z') },
    ]);
    const h = harness(data);
    const run = await runOnce(h);

    expect(h.statsWindows).toEqual([
      {
        start: at('2026-01-01T00:00:00.000Z'),
        end: at('2026-02-10T00:00:00.000Z'),
      },
    ]);
    expect(run.summary).toMatchObject({ test: { signals: { signals: 3 } } });
  });

  it('marque inéligibles un fold sans signal et un fold incomplet, sans les agréger', async () => {
    const h = harness(dataset(BOUNDARY_MATCHES));
    const run = await runOnce(
      h,
      params({ to: at('2026-02-08T00:00:00.000Z') }),
    );

    expect(run.folds.map((f) => [f.status, f.ineligibilityReason])).toEqual([
      ['COMPLETED', null],
      ['COMPLETED', null],
      ['INELIGIBLE', 'INSUFFICIENT_ODDS_COVERAGE'],
      ['INELIGIBLE', 'NO_SIGNAL'],
      ['INELIGIBLE', 'INCOMPLETE_WINDOW'],
    ]);
    const summary = run.summary as unknown as WalkForwardSummary;
    expect(summary.eligibleFolds).toBe(2);
    expect(summary.ineligibleByReason).toEqual({
      INSUFFICIENT_ODDS_COVERAGE: 1,
      NO_SIGNAL: 1,
      INCOMPLETE_WINDOW: 1,
    });
    expect(summary.test.kpis.betCount).toBe(2);
    expect(summary.test.signals.oddsCoveragePct).toBe(100);
  });

  it('une stratégie modifiée après lancement n’a aucun effet', async () => {
    const reference = await runOnce(harness(dataset(BOUNDARY_MATCHES)));

    const h = harness(dataset(BOUNDARY_MATCHES));
    const input = params();
    const { runId } = await h.service.start(input, 'user-1');
    input.strategy.markets = [];
    input.strategy.entryRules.firstHalfRules = [];
    input.strategy.bankroll = 0;
    input.strategyVersion = 'falsifiée';
    await h.service.execute(runId);
    const run = (await h.service.getRun(runId))!;

    expect(run.strategyVersion).toBe('baseline-1.0.0');
    expect(run.configHash).toBe(reference.configHash);
    expect(run.resultHash).toBe(reference.resultHash);
    expect(run.folds.map((f) => f.metrics)).toEqual(
      reference.folds.map((f) => f.metrics),
    );
  });

  it('rejoue bit à bit : mêmes hashes et mêmes métriques, quel que soit l’ordre des cotes', async () => {
    const first = await runOnce(harness(dataset(BOUNDARY_MATCHES)));
    const reversed = dataset(BOUNDARY_MATCHES);
    reversed.quotes.reverse();
    const second = await runOnce(harness(reversed));

    expect(first.status).toBe('COMPLETED');
    expect(second.configHash).toBe(first.configHash);
    expect(second.datasetHash).toBe(first.datasetHash);
    expect(second.resultHash).toBe(first.resultHash);
    expect(JSON.stringify(second.summary)).toBe(JSON.stringify(first.summary));
    expect(second.folds.map((f) => JSON.stringify(f.metrics))).toEqual(
      first.folds.map((f) => JSON.stringify(f.metrics)),
    );
    expect(first.configHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('change de hash dès que la donnée ou la configuration change', async () => {
    const base = await runOnce(harness(dataset(BOUNDARY_MATCHES)));
    const otherOdds = dataset(BOUNDARY_MATCHES);
    otherOdds.quotes[0].oddValue = 1.9;
    const changedData = await runOnce(harness(otherOdds));
    const changedConfig = await runOnce(
      harness(dataset(BOUNDARY_MATCHES)),
      params({ executionLatencyMs: 1 }),
    );

    expect(changedData.datasetHash).not.toBe(base.datasetHash);
    expect(changedData.configHash).toBe(base.configHash);
    expect(changedConfig.configHash).not.toBe(base.configHash);
  });

  it('bankroll nulle : signaux comptés, aucun pari placé', async () => {
    const input = params();
    input.strategy.bankroll = 0;
    const run = await runOnce(harness(dataset(BOUNDARY_MATCHES)), input);
    const summary = run.summary as unknown as WalkForwardSummary;

    expect(summary.test.signals.placed).toBe(3);
    expect(summary.test.kpis.betCount).toBe(0);
    expect(summary.test.kpis.bankrollSkippedBets).toBe(3);
    expect(summary.test.kpis.finalBankroll).toBe(0);
  });

  it('aucune requête par fixture ni par fold : une lecture groupée par table', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      index: i + 1,
      decisionAt: new Date(
        Date.parse('2026-01-16T06:00:00.000Z') + i * 2 * DAY,
      ),
    }));
    const h = harness(dataset(many));
    await runOnce(h);

    expect(h.replaySpy).toHaveBeenCalledTimes(1);
    expect(h.statsRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(h.fixtureRepo.findBy).toHaveBeenCalledTimes(1);
    expect(h.eventRepo.find).toHaveBeenCalledTimes(1);
    expect(h.loadCandidates).toHaveBeenCalledTimes(1);
    expect(h.foldRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('n’exécute un run qu’une seule fois', async () => {
    const h = harness(dataset(BOUNDARY_MATCHES));
    const { runId } = await h.service.start(params(), 'user-1');
    await Promise.all([h.service.execute(runId), h.service.execute(runId)]);
    await h.service.execute(runId);

    expect(h.replaySpy).toHaveBeenCalledTimes(1);
    expect(h.foldRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('passe le run en FAILED sans folds si le rejeu échoue', async () => {
    const h = harness(dataset(BOUNDARY_MATCHES));
    h.replaySpy.mockRejectedValueOnce(new Error('panne SGBD'));
    const { runId } = await h.service.start(params(), 'user-1');

    await expect(h.service.execute(runId)).rejects.toThrow('panne SGBD');
    expect(h.runs.get(runId)).toMatchObject({ status: 'FAILED' });
    expect(h.folds).toHaveLength(0);
  });

  describe('exécutant unique et runs orphelins', () => {
    it('tient le verrou du run pendant le rejeu et le relâche, succès comme échec', async () => {
      const h = harness(dataset(BOUNDARY_MATCHES));
      const { runId } = await h.service.start(params(), 'user-1');
      let heldDuringReplay = false;
      h.replaySpy.mockImplementationOnce(async () => {
        heldDuringReplay = h.heldLocks.has(walkForwardLockName(runId));
        throw new Error('panne');
      });
      await expect(h.service.execute(runId)).rejects.toThrow('panne');
      expect(heldDuringReplay).toBe(true);
      expect(h.heldLocks.size).toBe(0);
    });

    it('ne touche pas un run dont le verrou est tenu par un autre exécutant', async () => {
      const h = harness(dataset(BOUNDARY_MATCHES));
      const { runId } = await h.service.start(params(), 'user-1');
      h.heldLocks.add(walkForwardLockName(runId));

      await h.service.execute(runId);

      expect(h.replaySpy).not.toHaveBeenCalled();
      expect(h.runs.get(runId)).toMatchObject({ status: 'PENDING' });
    });

    it('clôt les orphelins en une seule requête conditionnée au verrou libre et au délai de grâce', async () => {
      const h = harness(dataset([]));
      h.dataSource.query.mockResolvedValueOnce({ affectedRows: 2 });
      const now = new Date('2026-10-11T08:00:00.000Z');

      await expect(h.service.failOrphanedRuns(now)).resolves.toBe(2);

      expect(h.dataSource.query).toHaveBeenCalledTimes(1);
      const [sql, args] = h.dataSource.query.mock.calls[0] as unknown as [
        string,
        unknown[],
      ];
      expect(sql).toContain("status IN ('PENDING', 'RUNNING')");
      expect(sql).toContain(
        "IS_USED_LOCK(CONCAT('api_score:wf:', id)) IS NULL",
      );
      expect(args).toEqual([
        WALK_FORWARD_ORPHAN_ERROR,
        now,
        new Date(now.getTime() - WALK_FORWARD_ORPHAN_GRACE_MS),
      ]);
      expect(walkForwardLockName('x'.repeat(36)).length).toBeLessThanOrEqual(
        64,
      );
    });

    it('au démarrage, une base injoignable ne bloque pas l’application', async () => {
      const h = harness(dataset([]));
      h.dataSource.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(h.service.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(h.logger.error).toHaveBeenCalled();
    });
  });

  it('refuse une plage sans fenêtre de test', async () => {
    const h = harness(dataset([]));

    await expect(
      h.service.start(params({ to: at('2026-01-10T00:00:00.000Z') }), null),
    ).rejects.toThrow(BadRequestException);
  });
});
