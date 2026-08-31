import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { BacktestEngineService } from '../backtest/backtest-engine.service';
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

  beforeEach(async () => {
    engine = { run: jest.fn().mockResolvedValue({ id: 'run-1' }) };
    rulesConfig = { getConfig: jest.fn().mockResolvedValue(DEFAULT_CONFIG) };

    const module = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: BacktestEngineService, useValue: engine },
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
      odds: { source: ['STRATEGY_DEFAULT'], executionLatencyMs: 0 },
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
});
