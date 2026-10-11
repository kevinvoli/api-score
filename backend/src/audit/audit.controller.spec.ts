import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { BacktestEngineService } from '../backtest/backtest-engine.service';
import { baselineStrategy } from '../backtest/baseline.strategy';
import { WalkForwardService } from '../backtest/walk-forward.service';
import { AuthenticatedPrincipal, UserRole } from '../auth/auth.types';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RunWalkForwardDto } from './dto/run-walk-forward.dto';
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import {
  DEFAULT_CONFIG,
  SmartRulesConfigService,
} from '../settings/smart-rules-config.service';

/**
 * LOT A.5 : le bouton « Tester cette configuration en backtest » de
 * Paramètres envoie `entryRules` (la config en cours d'édition, pas encore
 * sauvegardée) plutôt que `strategy`. Ces tests verrouillent la priorité de
 * résolution documentée dans `AuditController.resolveStrategy`.
 */
describe('AuditController', () => {
  let controller: AuditController;
  let engine: { run: jest.Mock };
  let rulesConfig: { getConfig: jest.Mock };
  let walkForward: { start: jest.Mock; getRun: jest.Mock; listRuns: jest.Mock };

  beforeEach(async () => {
    engine = { run: jest.fn().mockResolvedValue({ id: 'run-1' }) };
    rulesConfig = { getConfig: jest.fn().mockResolvedValue(DEFAULT_CONFIG) };
    walkForward = {
      start: jest.fn().mockResolvedValue({ runId: 'wf-1' }),
      getRun: jest.fn().mockResolvedValue(null),
      listRuns: jest.fn().mockResolvedValue([{ id: 'wf-1' }]),
    };

    const module = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: BacktestEngineService, useValue: engine },
        { provide: WalkForwardService, useValue: walkForward },
        { provide: SmartRulesConfigService, useValue: rulesConfig },
        { provide: getRepositoryToken(BacktestRun), useValue: {} },
        { provide: getRepositoryToken(BetResult), useValue: {} },
      ],
    }).compile();

    controller = module.get(AuditController);
  });

  it('sans strategy ni entryRules, rejoue sur la config actuellement persistée', async () => {
    await controller.runBacktest({});

    expect(rulesConfig.getConfig).toHaveBeenCalledTimes(1);
    const [, strategy] = engine.run.mock.calls[0];
    expect(strategy.entryRules).toEqual(DEFAULT_CONFIG);
  });

  it('avec entryRules, teste la config fournie sans toucher à celle persistée', async () => {
    const editedConfig = {
      ...DEFAULT_CONFIG,
      firstHalfRules: [{ maxElapsed: 12, minShots: 4 }],
    };

    await controller.runBacktest({ entryRules: editedConfig });

    expect(rulesConfig.getConfig).not.toHaveBeenCalled();
    const [, strategy] = engine.run.mock.calls[0];
    expect(strategy.entryRules).toEqual(editedConfig);
  });

  it('avec une strategy complète, l’utilise telle quelle et ignore entryRules', async () => {
    const fullStrategy = {
      name: 'custom',
      entryRules: DEFAULT_CONFIG,
      staking: { type: 'FLAT', amount: 1 },
      odds: { source: ['ODDS_SNAPSHOT'], executionLatencyMs: 0 },
    };

    await controller.runBacktest({
      strategy: fullStrategy,
      entryRules: { firstHalfRules: [] },
    });

    expect(rulesConfig.getConfig).not.toHaveBeenCalled();
    const [, strategy] = engine.run.mock.calls[0];
    expect(strategy).toEqual(fullStrategy);
  });

  it('rejette une strategy invalide (staking/odds manquants)', async () => {
    await expect(
      controller.runBacktest({
        strategy: { name: 'incomplete', entryRules: DEFAULT_CONFIG },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(engine.run).not.toHaveBeenCalled();
  });

  it('nomme le run avec le nom fourni, sinon celui de la stratégie', async () => {
    await controller.runBacktest({ name: 'Test config (Paramètres)' });

    const [name] = engine.run.mock.calls[0];
    expect(name).toBe('Test config (Paramètres)');
  });

  describe('walk-forward', () => {
    const admin: AuthenticatedPrincipal = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      sessionId: 'session-1',
    };

    function body(overrides: Record<string, unknown> = {}) {
      return {
        strategyVersion: 'baseline-1.0.0',
        strategy: structuredClone(baselineStrategy()) as unknown as Record<
          string,
          unknown
        >,
        trainWindowDays: 60,
        validationWindowDays: 14,
        testWindowDays: 14,
        stepDays: 14,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
        maxQuoteAgeMs: 120_000,
        executionLatencyMs: 30_000,
        ...overrides,
      };
    }

    async function dto(overrides: Record<string, unknown> = {}) {
      const instance = plainToInstance(RunWalkForwardDto, body(overrides));
      return { instance, errors: await validate(instance) };
    }

    it('réserve le lancement à ADMIN et la lecture à VIEWER+', () => {
      const prototype = AuditController.prototype;
      expect(Reflect.getMetadata(ROLES_KEY, prototype.runWalkForward)).toEqual([
        UserRole.ADMIN,
      ]);
      expect(Reflect.getMetadata(ROLES_KEY, prototype.getWalkForward)).toEqual([
        UserRole.VIEWER,
      ]);
      expect(Reflect.getMetadata(ROLES_KEY, prototype.listWalkForward)).toEqual(
        [UserRole.VIEWER],
      );
    });

    it('liste les runs récents via le service', async () => {
      await expect(controller.listWalkForward()).resolves.toEqual([
        { id: 'wf-1' },
      ]);
      expect(walkForward.listRuns).toHaveBeenCalledWith();
    });

    it('accepte un contrat complet et transmet les paramètres figés et l’auteur', async () => {
      const { instance, errors } = await dto({ bookmakerKey: 'bet365' });
      expect(errors).toEqual([]);

      await expect(controller.runWalkForward(instance, admin)).resolves.toEqual(
        { runId: 'wf-1' },
      );
      const [params, requestedBy] = walkForward.start.mock.calls[0];
      expect(requestedBy).toBe('admin-1');
      expect(params).toMatchObject({
        strategyVersion: 'baseline-1.0.0',
        trainWindowDays: 60,
        bookmakerKey: 'bet365',
        maxQuoteAgeMs: 120_000,
        executionLatencyMs: 30_000,
      });
      expect(params.from).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it.each([
      ['champ obligatoire absent', { trainWindowDays: undefined }],
      ['fenêtre nulle', { testWindowDays: 0 }],
      ['fenêtre hors borne', { stepDays: 366 }],
      ['âge de cote trop faible', { maxQuoteAgeMs: 999 }],
      ['âge de cote trop élevé', { maxQuoteAgeMs: 600_001 }],
      ['latence négative', { executionLatencyMs: -1 }],
      ['latence non entière', { executionLatencyMs: 1.5 }],
      ['version avec espace', { strategyVersion: 'v 1' }],
      ['date invalide', { from: 'pas-une-date' }],
      ['bookmaker vide', { bookmakerKey: '   ' }],
      ['stratégie non objet', { strategy: 'baseline' }],
    ])('refuse le DTO : %s', async (_label, overrides) => {
      const { errors } = await dto(overrides);
      expect(errors.length).toBeGreaterThan(0);
    });

    it.each([
      ['sans marchés', (s: Record<string, unknown>) => (s.markets = [])],
      ['bankroll négative', (s: Record<string, unknown>) => (s.bankroll = -1)],
      [
        'staking inconnu',
        (s: Record<string, unknown>) =>
          (s.staking = { type: 'KELLY', amount: 1 }),
      ],
      [
        'pourcentage > 100',
        (s: Record<string, unknown>) =>
          (s.staking = { type: 'PERCENT_BANKROLL', amount: 101 }),
      ],
      ['règles absentes', (s: Record<string, unknown>) => delete s.entryRules],
      ['odds absent', (s: Record<string, unknown>) => delete s.odds],
    ])('refuse une stratégie %s sans rien lancer', async (_label, mutate) => {
      const { instance } = await dto();
      mutate(instance.strategy);

      await expect(controller.runWalkForward(instance, admin)).rejects.toThrow(
        BadRequestException,
      );
      expect(walkForward.start).not.toHaveBeenCalled();
    });

    it('refuse une plage inversée ou supérieure à trois ans', async () => {
      const inverted = (
        await dto({
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        })
      ).instance;
      const tooLong = (await dto({ from: '2020-01-01T00:00:00.000Z' }))
        .instance;

      await expect(controller.runWalkForward(inverted, admin)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.runWalkForward(tooLong, admin)).rejects.toThrow(
        BadRequestException,
      );
      expect(walkForward.start).not.toHaveBeenCalled();
    });

    it('rend 404 sur un run inconnu et le run avec ses folds sinon', async () => {
      await expect(
        controller.getWalkForward('8a4f6c1e-0000-4000-8000-000000000000'),
      ).rejects.toThrow(NotFoundException);

      walkForward.getRun.mockResolvedValue({ id: 'wf-1', folds: [] });
      await expect(controller.getWalkForward('wf-1')).resolves.toEqual({
        id: 'wf-1',
        folds: [],
      });
    });
  });
});
