/**
 * Fonctions pures de calcul de probabilité implicite à partir de cotes décimales.
 * Aucune dépendance à la DB ou au provider : testables isolément.
 */

/**
 * Probabilité implicite brute d'une cote décimale (1 / cote).
 * Retourne null si la cote est invalide (<=1 ou non finie) plutôt que de
 * produire une valeur aberrante (proba négative ou >1).
 */
export function impliedProbability(odd: number): number | null {
  if (!Number.isFinite(odd) || odd <= 1) {
    return null;
  }
  return 1 / odd;
}

/**
 * Overround (somme des probabilités brutes) d'un marché.
 * Les cotes invalides sont ignorées (contribution nulle) plutôt que de
 * fausser la somme.
 */
export function computeOverround(odds: number[]): number {
  return odds.reduce((sum, odd) => sum + (impliedProbability(odd) ?? 0), 0);
}

/**
 * Retire la marge du bookmaker (overround) pour obtenir des probabilités "fair".
 *
 * Méthode proportionnelle (la plus simple) : fair_i = raw_i / overround.
 * On la préfère ici à des méthodes plus fines comme Shin ou power, qui modélisent
 * la marge comme un biais lié à la présence de parieurs mieux informés plutôt
 * qu'une simple normalisation — pertinent pour la Phase 3 (calibration du modèle),
 * pas nécessaire pour une première historisation des cotes.
 */
export function removeMargin(odds: number[]): {
  raw: number[];
  fair: number[];
  overround: number;
} {
  if (!odds.length) {
    return { raw: [], fair: [], overround: 0 };
  }

  const raw = odds.map((odd) => impliedProbability(odd) ?? 0);
  const overround = raw.reduce((sum, p) => sum + p, 0);
  const fair = overround > 0 ? raw.map((p) => p / overround) : raw.map(() => 0);

  return { raw, fair, overround };
}
