import { DEFAULT_CONFIG } from '../settings/smart-rules-config.service';
import { baselineStrategy } from './baseline.strategy';
import { isWalkForwardStrategy } from './strategy.guard';

describe('baselineStrategy()', () => {
  it('renvoie une copie : muter la stratégie ne touche pas la configuration par défaut', () => {
    const before = JSON.stringify(DEFAULT_CONFIG);
    const strategy = baselineStrategy();
    strategy.entryRules.firstHalfRules.length = 0;
    (strategy.entryRules as unknown as Record<string, unknown>).odds = null;
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
    expect(baselineStrategy().entryRules).toEqual(DEFAULT_CONFIG);
  });
});

describe('isWalkForwardStrategy()', () => {
  it('accepte la stratégie baseline complète', () => {
    expect(isWalkForwardStrategy(baselineStrategy())).toBe(true);
  });

  it.each([
    ['non objet', null],
    ['sans nom', { ...baselineStrategy(), name: ' ' }],
    ['sans marché', { ...baselineStrategy(), markets: [] }],
    ['bankroll négative', { ...baselineStrategy(), bankroll: -1 }],
    [
      'pourcentage > 100',
      {
        ...baselineStrategy(),
        staking: { type: 'PERCENT_BANKROLL', amount: 101 },
      },
    ],
    ['sans odds', { ...baselineStrategy(), odds: undefined }],
    [
      'règles vides',
      {
        ...baselineStrategy(),
        entryRules: { ...DEFAULT_CONFIG, firstHalfRules: [] },
      },
    ],
  ])('refuse : %s', (_label, value) => {
    expect(isWalkForwardStrategy(value)).toBe(false);
  });
});
