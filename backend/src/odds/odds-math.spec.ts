import {
  computeOverround,
  impliedProbability,
  removeMargin,
} from './odds-math';

describe('odds-math', () => {
  describe('impliedProbability()', () => {
    it('calcule 1 / cote pour une cote valide', () => {
      expect(impliedProbability(2)).toBe(0.5);
      expect(impliedProbability(4)).toBe(0.25);
    });

    it('retourne null pour une cote <= 1', () => {
      expect(impliedProbability(1)).toBeNull();
      expect(impliedProbability(0.5)).toBeNull();
      expect(impliedProbability(0)).toBeNull();
      expect(impliedProbability(-2)).toBeNull();
    });

    it('retourne null pour une cote non finie', () => {
      expect(impliedProbability(NaN)).toBeNull();
      expect(impliedProbability(Infinity)).toBeNull();
    });
  });

  describe('computeOverround()', () => {
    it("somme les probabilités implicites d'un marché 1X2 réaliste", () => {
      // cotes typiques avec ~7% de marge bookmaker
      const overround = computeOverround([2.1, 3.4, 3.6]);
      expect(overround).toBeCloseTo(1 / 2.1 + 1 / 3.4 + 1 / 3.6, 10);
      expect(overround).toBeGreaterThan(1);
    });

    it('retourne 0 pour un marché vide', () => {
      expect(computeOverround([])).toBe(0);
    });

    it('ignore les cotes invalides sans fausser la somme', () => {
      const overround = computeOverround([2, 1, NaN]);
      expect(overround).toBe(0.5);
    });
  });

  describe('removeMargin() — méthode proportionnelle', () => {
    it('normalise un marché 1X2 réaliste pour que les probas fair somment à 1', () => {
      const { fair, overround } = removeMargin([2.1, 3.4, 3.6]);
      expect(overround).toBeGreaterThan(1);
      const sumFair = fair.reduce((a, b) => a + b, 0);
      expect(sumFair).toBeCloseTo(1, 10);
    });

    it('retourne des tableaux vides pour un marché vide', () => {
      expect(removeMargin([])).toEqual({ raw: [], fair: [], overround: 0 });
    });

    it('retourne overround = 0 et fair = 0 quand toutes les cotes sont invalides', () => {
      const { raw, fair, overround } = removeMargin([1, 0, NaN]);
      expect(overround).toBe(0);
      expect(raw).toEqual([0, 0, 0]);
      expect(fair).toEqual([0, 0, 0]);
    });

    it('préserve la correspondance index à index entre odds et raw/fair', () => {
      const { raw, fair } = removeMargin([2, 4]);
      expect(raw[0]).toBeCloseTo(0.5, 10);
      expect(raw[1]).toBeCloseTo(0.25, 10);
      expect(fair[0]).toBeGreaterThan(fair[1]);
    });
  });
});
