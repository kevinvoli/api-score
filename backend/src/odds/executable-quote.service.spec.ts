import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { OddsSnapshot } from '../database/entities/odds-snapshot.entity';
import { ExecutableQuoteService } from './executable-quote.service';
import { ExecutableQuote, ExecutableQuoteTarget } from './odds.types';

const AT = new Date('2026-10-02T12:00:00.000Z');
const TARGET: ExecutableQuoteTarget = {
  providerKey: 'apifootball',
  providerFixtureId: '42',
  bookmakerKey: 'bet365',
  marketKey: 'TEAM_GOALS_FT',
  selectionKey: 'HOME_OVER_0.5',
};

function quote(overrides: Partial<ExecutableQuote> = {}): ExecutableQuote {
  return {
    snapshotId: 'snapshot-a',
    providerKey: 'apifootball',
    fixtureId: 'fixture-a',
    providerFixtureId: '42',
    bookmakerKey: 'bet365',
    marketKey: 'TEAM_GOALS_FT',
    selectionKey: 'HOME_OVER_0.5',
    oddValue: 1.8,
    observedAt: new Date('2026-10-02T11:59:30.000Z'),
    receivedAt: new Date('2026-10-02T11:59:31.000Z'),
    available: true,
    ...overrides,
  };
}

describe('ExecutableQuoteService', () => {
  let service: ExecutableQuoteService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExecutableQuoteService,
        {
          provide: getRepositoryToken(OddsSnapshot),
          useValue: { createQueryBuilder: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ExecutableQuoteService);
  });

  const select = (
    candidates: ExecutableQuote[],
    at = AT,
    maxQuoteAgeMs = 120_000,
    target = TARGET,
  ) => service.selectLatest(candidates, { target, at, maxQuoteAgeMs });

  it('sélectionne la dernière cote exacte admissible à T', () => {
    const older = quote({
      snapshotId: 'older',
      observedAt: new Date('2026-10-02T11:59:00.000Z'),
      receivedAt: new Date('2026-10-02T11:59:01.000Z'),
      oddValue: 1.7,
    });
    expect(select([older, quote()])?.oddValue).toBe(1.8);
  });

  it('exclut une cote reçue après T', () => {
    expect(
      select([quote({ receivedAt: new Date('2026-10-02T12:00:00.001Z') })]),
    ).toBeNull();
  });

  it('exclut une observation future', () => {
    expect(
      select([
        quote({
          observedAt: new Date('2026-10-02T12:00:01.000Z'),
          receivedAt: new Date('2026-10-02T12:00:02.000Z'),
        }),
      ]),
    ).toBeNull();
  });

  it('exclut un marché suspendu', () => {
    expect(select([{ ...quote(), available: false }])).toBeNull();
  });

  it('exclut une cote périmée', () => {
    expect(
      select(
        [
          quote({
            observedAt: new Date('2026-10-02T11:57:59.999Z'),
            receivedAt: new Date('2026-10-02T11:58:00.000Z'),
          }),
        ],
        AT,
        120_000,
      ),
    ).toBeNull();
  });

  it('ne mélange ni bookmaker, ni marché, ni sélection', () => {
    const candidates = [
      quote({ bookmakerKey: 'unibet', oddValue: 2.1 }),
      quote({ marketKey: 'TEAM_GOAL_1H', oddValue: 2.2 }),
      quote({ selectionKey: 'AWAY_OVER_0.5', oddValue: 2.3 }),
      quote({ oddValue: 1.9 }),
    ];
    expect(select(candidates)?.oddValue).toBe(1.9);
  });

  it('retourne null quand aucune cote exacte n’existe', () => {
    expect(select([])).toBeNull();
  });

  it('exige une cote séparée à T + latence', () => {
    const decisionQuote = quote({
      observedAt: new Date('2026-10-02T11:59:59.000Z'),
      receivedAt: new Date('2026-10-02T11:59:59.500Z'),
    });
    expect(select([decisionQuote])).not.toBeNull();
    expect(
      select([decisionQuote], new Date('2026-10-02T12:02:01.000Z'), 120_000),
    ).toBeNull();
  });

  it('départage deux snapshots concurrents de façon déterministe', () => {
    const left = quote({ snapshotId: 'snapshot-a', oddValue: 1.7 });
    const right = quote({ snapshotId: 'snapshot-b', oddValue: 2.2 });
    expect(select([right, left])?.snapshotId).toBe('snapshot-a');
    expect(select([left, right])?.snapshotId).toBe('snapshot-a');
  });
});
