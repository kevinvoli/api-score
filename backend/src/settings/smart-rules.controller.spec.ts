import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UpdateSmartRulesDto } from './dto/update-smart-rules.dto';
import {
  DEFAULT_CONFIG,
  SmartRulesConfigService,
} from './smart-rules-config.service';
import { SmartRulesController } from './smart-rules.controller';

function makeDto(
  overrides: Partial<UpdateSmartRulesDto> = {},
): UpdateSmartRulesDto {
  return {
    firstHalfRules: [
      { maxElapsed: 10, minShots: 5 },
      { maxElapsed: 20, minShots: 7 },
    ],
    secondHalfRule: { maxElapsed: 60, minShots: 5 },
    ...overrides,
  } as UpdateSmartRulesDto;
}

describe('SmartRulesController', () => {
  let controller: SmartRulesController;
  let service: { getConfig: jest.Mock; updateConfig: jest.Mock };

  beforeEach(async () => {
    service = {
      getConfig: jest.fn().mockResolvedValue(DEFAULT_CONFIG),
      updateConfig: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };

    const module = await Test.createTestingModule({
      controllers: [SmartRulesController],
      providers: [{ provide: SmartRulesConfigService, useValue: service }],
    }).compile();

    controller = module.get(SmartRulesController);
  });

  it('persiste la configuration dans la forme réellement consommée par le moteur', async () => {
    await controller.updateConfig(makeDto());

    const saved = service.updateConfig.mock.calls[0][0];
    expect(saved.firstHalfRules).toEqual([
      { maxElapsed: 10, minShots: 5 },
      { maxElapsed: 20, minShots: 7 },
    ]);
    expect(saved.secondHalfRule).toEqual({ maxElapsed: 60, minShots: 5 });
  });

  it('retombe sur les cotes par défaut quand le bloc odds est omis', async () => {
    await controller.updateConfig(makeDto());

    expect(service.updateConfig.mock.calls[0][0].odds).toEqual(
      DEFAULT_CONFIG.odds,
    );
  });

  it('conserve les cotes fournies quand elles sont présentes', async () => {
    const odds = {
      firstHalfHT: { current: 2, min: 1.8, edgePct: 10, confidence: 60 },
      firstHalfFT: { current: 1.5, min: 1.4, edgePct: 5, confidence: 65 },
      secondHalf: { current: 1.7, min: 1.55, edgePct: 8, confidence: 70 },
    };

    await controller.updateConfig(makeDto({ odds }));

    expect(service.updateConfig.mock.calls[0][0].odds).toEqual(odds);
  });

  it('refuse deux règles partageant la même fenêtre (la seconde serait morte)', async () => {
    const dto = makeDto({
      firstHalfRules: [
        { maxElapsed: 45, minShots: 13 },
        { maxElapsed: 45, minShots: 16 },
      ],
    });

    // Rejet synchrone : la garde s'exécute avant toute promesse.
    expect(() => controller.updateConfig(dto)).toThrow(BadRequestException);
    expect(service.updateConfig).not.toHaveBeenCalled();
  });
});
