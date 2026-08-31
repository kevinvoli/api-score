import { DEFAULT_CONFIG } from '../../settings/smart-rules-config.service';
import { evaluateRules, RuleEvaluationInput } from './rules-evaluator';

function makeInput(
  overrides: Partial<RuleEvaluationInput> = {},
): RuleEvaluationInput {
  return {
    elapsed: 25,
    statusShort: '1H',
    home: { teamId: 10, teamName: 'PSG', totalShots: null },
    away: { teamId: 20, teamName: 'Lyon', totalShots: null },
    liveOdd: null,
    ...overrides,
  };
}

describe('evaluateRules()', () => {
  describe('1ère mi-temps', () => {
    it('déclenche deux marchés (mi-temps + match) quand le seuil est atteint', () => {
      const input = makeInput({
        elapsed: 25,
        home: { teamId: 10, teamName: 'PSG', totalShots: 12 },
      });

      const matches = evaluateRules(input, DEFAULT_CONFIG);

      expect(matches.map((m) => m.marketType)).toEqual([
        'Buts 1ère mi-temps',
        'Buts match',
      ]);
      expect(matches[0].teamId).toBe(10);
      expect(matches[0].isHomeTeam).toBe(true);
      expect(matches[0].currentOdd).toBe(1.75);
      expect(matches[1].currentOdd).toBe(1.45);
    });

    it('respecte les seuils exacts : shots=9 sous le seuil 10 à elapsed=25 → rien', () => {
      const input = makeInput({
        elapsed: 25,
        home: { teamId: 10, teamName: 'PSG', totalShots: 9 },
      });

      expect(evaluateRules(input, DEFAULT_CONFIG)).toHaveLength(0);
    });

    it('borne exclusive sur elapsed : elapsed=45 (>= maxWindow) → rien', () => {
      const input = makeInput({
        elapsed: 45,
        home: { teamId: 10, teamName: 'PSG', totalShots: 20 },
      });

      expect(evaluateRules(input, DEFAULT_CONFIG)).toHaveLength(0);
    });

    it('utilise la première règle qui matche (fenêtres progressives)', () => {
      // elapsed=8 → règle {maxElapsed:10, minShots:5} : 5 tirs suffisent
      const input = makeInput({
        elapsed: 8,
        away: { teamId: 20, teamName: 'Lyon', totalShots: 5 },
      });

      const matches = evaluateRules(input, DEFAULT_CONFIG);
      expect(matches).toHaveLength(2);
      expect(matches[0].isHomeTeam).toBe(false);
      expect(matches[0].reasons[0]).toContain('seuil : ≥5 avant 10');
    });

    it('la cote live prime sur la cote par défaut de la config', () => {
      const input = makeInput({
        elapsed: 25,
        home: { teamId: 10, teamName: 'PSG', totalShots: 12 },
        liveOdd: 2.1,
      });

      const matches = evaluateRules(input, DEFAULT_CONFIG);
      expect(matches[0].currentOdd).toBe(2.1);
      expect(matches[1].currentOdd).toBe(2.1);
    });

    it('ignore une équipe sans donnée de tirs (null ≠ 0)', () => {
      const input = makeInput({
        elapsed: 25,
        home: { teamId: 10, teamName: 'PSG', totalShots: null },
        away: { teamId: 20, teamName: 'Lyon', totalShots: 12 },
      });

      const matches = evaluateRules(input, DEFAULT_CONFIG);
      expect(matches.every((m) => m.teamId === 20)).toBe(true);
    });

    it('statut hors 1H/LIVE → rien', () => {
      const input = makeInput({
        statusShort: 'HT',
        home: { teamId: 10, teamName: 'PSG', totalShots: 12 },
      });

      expect(evaluateRules(input, DEFAULT_CONFIG)).toHaveLength(0);
    });
  });

  describe('2ème mi-temps', () => {
    it('déclenche sur les tirs de 2MT uniquement (baseline HT soustraite)', () => {
      // 12 tirs au total dont 8 en 1MT → 4 tirs en 2MT < seuil 5 → rien
      const below = makeInput({
        elapsed: 50,
        statusShort: '2H',
        home: { teamId: 10, teamName: 'PSG', totalShots: 12 },
        htShots: { home: 8, away: 0 },
      });
      expect(evaluateRules(below, DEFAULT_CONFIG)).toHaveLength(0);

      // 13 tirs dont 8 en 1MT → 5 en 2MT >= seuil 5 → déclenche
      const at = makeInput({
        elapsed: 50,
        statusShort: '2H',
        home: { teamId: 10, teamName: 'PSG', totalShots: 13 },
        htShots: { home: 8, away: 0 },
      });
      const matches = evaluateRules(at, DEFAULT_CONFIG);
      expect(matches).toHaveLength(1);
      expect(matches[0].marketType).toBe('Buts 2ème mi-temps');
      expect(matches[0].shotsCount).toBe(5);
      expect(matches[0].currentOdd).toBe(1.65);
    });

    it('borne exclusive : elapsed=60 (>= maxElapsed) → rien', () => {
      const input = makeInput({
        elapsed: 60,
        statusShort: '2H',
        home: { teamId: 10, teamName: 'PSG', totalShots: 20 },
        htShots: { home: 0, away: 0 },
      });

      expect(evaluateRules(input, DEFAULT_CONFIG)).toHaveLength(0);
    });

    it('elapsed < 45 → rien même en statut 2H', () => {
      const input = makeInput({
        elapsed: 40,
        statusShort: '2H',
        home: { teamId: 10, teamName: 'PSG', totalShots: 20 },
        htShots: { home: 0, away: 0 },
      });

      expect(evaluateRules(input, DEFAULT_CONFIG)).toHaveLength(0);
    });
  });

  it('est déterministe : deux appels identiques produisent le même résultat', () => {
    const input = makeInput({
      elapsed: 25,
      home: { teamId: 10, teamName: 'PSG', totalShots: 12 },
    });

    expect(evaluateRules(input, DEFAULT_CONFIG)).toEqual(
      evaluateRules(input, DEFAULT_CONFIG),
    );
  });
});

describe('evaluateRules() — signal configurable (LOT 3.2)', () => {
  it('ON_TARGET : déclenche sur les tirs cadrés, ignore le total de tirs', () => {
    const config = { ...DEFAULT_CONFIG, signal: 'ON_TARGET' as const };
    const input = makeInput({
      elapsed: 25, // règle { maxElapsed: 30, minShots: 10 }
      home: {
        teamId: 10,
        teamName: 'PSG',
        totalShots: 2, // sous le seuil en TOTAL_SHOTS
        shotsOnTarget: 12, // au-dessus en ON_TARGET
      },
    });

    const matches = evaluateRules(input, config);
    expect(matches.map((m) => m.marketType)).toEqual([
      'Buts 1ère mi-temps',
      'Buts match',
    ]);
    expect(matches[0].signal).toBe('ON_TARGET');
    expect(matches[0].shotsCount).toBe(12);
  });

  it('ON_TARGET : pas de déclenchement si les tirs cadrés sont sous le seuil, même avec beaucoup de tirs', () => {
    const config = { ...DEFAULT_CONFIG, signal: 'ON_TARGET' as const };
    const input = makeInput({
      elapsed: 25,
      home: { teamId: 10, teamName: 'PSG', totalShots: 20, shotsOnTarget: 3 },
    });
    expect(evaluateRules(input, config)).toHaveLength(0);
  });

  it("PRESSURE_INDEX : déclenche sur l'indice de pression", () => {
    const config = { ...DEFAULT_CONFIG, signal: 'PRESSURE_INDEX' as const };
    const input = makeInput({
      elapsed: 25,
      home: {
        teamId: 10,
        teamName: 'PSG',
        totalShots: null,
        pressureIndex: 11,
      },
    });
    const matches = evaluateRules(input, config);
    expect(matches).toHaveLength(2);
    expect(matches[0].signal).toBe('PRESSURE_INDEX');
  });
});

describe('evaluateRules() — modulation par état au score (LOT 3.4)', () => {
  it("relève le seuil quand l'équipe mène", () => {
    const config = {
      ...DEFAULT_CONFIG,
      scoreStateModifiers: { leading: 5, trailing: 0, drawing: 0 },
    };
    // 12 tirs, seuil de base 10 : déclencherait à l'état nul, mais l'équipe mène
    // (+5 → seuil effectif 15) donc 12 < 15 → rien.
    const input = makeInput({
      elapsed: 25,
      home: { teamId: 10, teamName: 'PSG', totalShots: 12 },
      scoreHome: 1,
      scoreAway: 0,
    });
    expect(evaluateRules(input, config)).toHaveLength(0);

    // Même input sans modulation → déclenche.
    expect(evaluateRules(input, DEFAULT_CONFIG).length).toBeGreaterThan(0);
  });

  it("abaisse le seuil quand l'équipe est menée et expose le seuil effectif", () => {
    const config = {
      ...DEFAULT_CONFIG,
      scoreStateModifiers: { leading: 0, trailing: -5, drawing: 0 },
    };
    // 6 tirs, seuil de base 10 : ne déclencherait pas, mais l'équipe est menée
    // (-5 → seuil effectif 5) donc 6 >= 5 → déclenche.
    const input = makeInput({
      elapsed: 25,
      home: { teamId: 10, teamName: 'PSG', totalShots: 6 },
      scoreHome: 0,
      scoreAway: 1,
    });
    const matches = evaluateRules(input, config);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].signalThreshold).toBe(5);
    expect(matches[0].reasons[0]).toContain('seuil : ≥5');
  });

  it('score inconnu → état neutre (drawing), aucun décalage appliqué', () => {
    const config = {
      ...DEFAULT_CONFIG,
      scoreStateModifiers: { leading: 5, trailing: 5, drawing: 0 },
    };
    const input = makeInput({
      elapsed: 25,
      home: { teamId: 10, teamName: 'PSG', totalShots: 12 },
      // scoreHome / scoreAway non fournis
    });
    expect(evaluateRules(input, config).length).toBeGreaterThan(0);
  });
});
