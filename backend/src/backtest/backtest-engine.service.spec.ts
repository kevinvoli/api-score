import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JsonLogger } from '../common/json.logger';
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { ExecutableQuoteService } from '../odds/executable-quote.service';
import { baselineStrategy } from './baseline.strategy';
import { BacktestEngineService } from './backtest-engine.service';
import { BacktestStrategy, DecidedBet } from './backtest.types';

function repositoryMock() {
  return {
    find: jest.fn(),
    findBy: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn(),
    insert: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function fixture(): Fixture {
  return {
    id: 'fixture-1',
    providerFixtureId: '42',
    leagueId: 39,
    season: 2026,
    homeTeamId: 10,
    awayTeamId: 20,
    homeTeamName: 'PSG',
    awayTeamName: 'Lyon',
    homeTeamBadge: null,
    awayTeamBadge: null,
    leagueName: 'Ligue 1',
    statusShort: 'FT',
    statusLong: 'Finished',
    elapsed: 90,
    matchDate: new Date('2026-10-02T11:30:00.000Z'),
    scoreHome: 1,
    scoreAway: 0,
    raw: { score: { halftime: { home: 0, away: 0 } } },
    lastSyncedAt: new Date('2026-10-02T13:30:00.000Z'),
    events: [],
    statsSnapshots: [],
    createdAt: new Date('2026-10-02T11:00:00.000Z'),
    updatedAt: new Date('2026-10-02T13:30:00.000Z'),
  } as Fixture;
}

function snapshot(): FixtureStatsSnapshot {
  return {
    id: 'snapshot-1',
    fixtureId: 'fixture-1',
    teamId: 10,
    half: null,
    elapsed: 25,
    stats: { statistics: [{ type: 'Total Shots', value: 12 }] },
    snapshotAt: new Date('2026-10-02T12:00:00.000Z'),
    createdAt: new Date('2026-10-02T12:00:00.000Z'),
    fixture: undefined as unknown as Fixture,
  } as FixtureStatsSnapshot;
}

describe('BacktestEngineService - cote observable', () => {
  let service: BacktestEngineService;
  let fixtureRepo: ReturnType<typeof repositoryMock>;
  let statsRepo: ReturnType<typeof repositoryMock>;
  let eventRepo: ReturnType<typeof repositoryMock>;
  let quoteService: { loadCandidates: jest.Mock; selectLatest: jest.Mock };

  beforeEach(async () => {
    fixtureRepo = repositoryMock();
    statsRepo = repositoryMock();
    eventRepo = repositoryMock();
    const statsQb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([snapshot()]),
    };
    statsRepo.createQueryBuilder.mockReturnValue(statsQb);
    fixtureRepo.findBy.mockResolvedValue([fixture()]);
    eventRepo.find.mockResolvedValue([]);
    quoteService = {
      loadCandidates: jest.fn().mockResolvedValue([]),
      selectLatest: jest.fn().mockReturnValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        BacktestEngineService,
        {
          provide: getRepositoryToken(BacktestRun),
          useValue: repositoryMock(),
        },
        { provide: getRepositoryToken(BetResult), useValue: repositoryMock() },
        { provide: getRepositoryToken(Fixture), useValue: fixtureRepo },
        {
          provide: getRepositoryToken(FixtureStatsSnapshot),
          useValue: statsRepo,
        },
        { provide: getRepositoryToken(FixtureEvent), useValue: eventRepo },
        { provide: ExecutableQuoteService, useValue: quoteService },
        {
          provide: JsonLogger,
          useValue: { log: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(BacktestEngineService);
  });

  async function replay(strategy: BacktestStrategy): Promise<DecidedBet[]> {
    const replayService = service as unknown as {
      replay(
        selectedStrategy: BacktestStrategy,
        window: { start: Date; end: Date },
      ): Promise<DecidedBet[]>;
    };
    return replayService.replay(strategy, {
      start: new Date('2026-10-02T11:00:00.000Z'),
      end: new Date('2026-10-02T13:00:00.000Z'),
    });
  }

  it('ne crée aucun pari exécutable sans cote admissible', async () => {
    const strategy = baselineStrategy();
    strategy.markets = ['Buts match'];

    await expect(replay(strategy)).resolves.toEqual([]);
    expect(quoteService.loadCandidates).toHaveBeenCalledTimes(1);
  });

  it('refuse le pari si aucune cote séparée n’est disponible après la latence', async () => {
    const strategy = baselineStrategy();
    strategy.markets = ['Buts match'];
    const decisionQuote = {
      snapshotId: 'quote-1',
      providerKey: 'apifootball',
      fixtureId: 'fixture-1',
      providerFixtureId: '42',
      bookmakerKey: 'bet365',
      marketKey: 'TEAM_GOALS_FT',
      selectionKey: 'HOME_OVER_0.5',
      oddValue: 1.8,
      observedAt: new Date('2026-10-02T11:59:59.000Z'),
      receivedAt: new Date('2026-10-02T11:59:59.500Z'),
      available: true,
    };
    quoteService.loadCandidates.mockResolvedValue([decisionQuote]);
    quoteService.selectLatest
      .mockReturnValueOnce(decisionQuote)
      .mockReturnValueOnce(null);

    await expect(replay(strategy)).resolves.toEqual([]);
    expect(quoteService.selectLatest).toHaveBeenCalledTimes(2);
  });

  describe('règlement aligné sur la simulation', () => {
    const quote = {
      snapshotId: 'quote-1',
      providerKey: 'apifootball',
      fixtureId: 'fixture-1',
      providerFixtureId: '42',
      bookmakerKey: 'bet365',
      marketKey: 'TEAM_GOALS_FT',
      selectionKey: 'HOME_OVER_0.5',
      oddValue: 1.8,
      observedAt: new Date('2026-10-02T11:59:59.000Z'),
      receivedAt: new Date('2026-10-02T11:59:59.500Z'),
      available: true,
    };

    async function placedOutcome(state: Partial<Fixture>) {
      fixtureRepo.findBy.mockResolvedValue([{ ...fixture(), ...state }]);
      quoteService.loadCandidates.mockResolvedValue([quote]);
      quoteService.selectLatest.mockReturnValue(quote);
      const strategy = baselineStrategy();
      strategy.markets = ['Buts match'];
      const bets = await replay(strategy);
      expect(bets).toHaveLength(1);
      return bets[0].outcome;
    }

    it('match reporté sans but : VOID (remboursé), plus LOST', async () => {
      await expect(
        placedOutcome({ statusShort: 'PST', scoreHome: 0, scoreAway: 0 }),
      ).resolves.toBe('VOID');
    });

    it('match interrompu après un but de l’équipe : issue déjà acquise, WON', async () => {
      await expect(
        placedOutcome({ statusShort: 'ABD', scoreHome: 1, scoreAway: 0 }),
      ).resolves.toBe('WON');
    });

    it('match terminé sans but : LOST', async () => {
      await expect(
        placedOutcome({ statusShort: 'FT', scoreHome: 0, scoreAway: 0 }),
      ).resolves.toBe('LOST');
    });
  });

  it('ne conserve aucun ancien fallback de prix dans les moteurs', () => {
    const source = [
      resolve(__dirname, 'backtest-engine.service.ts'),
      resolve(__dirname, '../recommendations/rules/rules-evaluator.ts'),
      resolve(__dirname, '../recommendations/smart-suggestions.service.ts'),
    ]
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const defaultSource = ['STRATEGY', 'DEFAULT'].join('_');
    const liveFallback = new RegExp(['liveOdd', String.raw`\s*\?\?`].join(''));
    const sourcedFallback = new RegExp(
      ['sourced', String.raw`\?\.odd\s*\?\?`].join(''),
    );

    expect(source).not.toContain(defaultSource);
    expect(source).not.toMatch(liveFallback);
    expect(source).not.toMatch(sourcedFallback);
  });
});
