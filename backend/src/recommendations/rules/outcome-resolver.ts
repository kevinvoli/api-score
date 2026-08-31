import { FIRST_HALF_STATUSES } from './rules-evaluator';

export interface ResolvableBet {
  marketType: string;
  isHomeTeam: boolean;
}

export interface FinalMatchState {
  statusShort: string;
  scoreHome: number | null;
  scoreAway: number | null;
  htScoreHome: number | null;
  htScoreAway: number | null;
}

// Statuts indiquant que la mi-temps est terminée (score HT connu)
// Valeurs normalisées par normalizeApifootballStatus + api-sports status.short
const POST_HT_STATUSES = new Set([
  'HT',
  '2H',
  'ET',
  'BT',
  'P',
  'FT',
  'AET',
  'PEN',
  'AWD',
  'WO',
]);
// Statuts indiquant que le match est terminé (score FT connu)
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
// Statuts "voids" : match annulé / reporté / interrompu définitivement → coupon LOST
// Valeurs normalisées : Cancelled→CANC, Postponed→PST, Suspended→SUSP, Pen.→PEN (déjà dans FINISHED)
const VOID_STATUSES = new Set([
  'CANC',
  'PST',
  'INT',
  'SUSP',
  'ABD',
  'TBD',
  'WO',
]);

/**
 * Résolution pure d'un pari : reproduit à l'identique resolveCouponOutcome
 * de SmartSuggestionsService, sans accès DB ni à fixture.raw (l'appelant
 * fournit l'état final déjà normalisé, y compris le score HT).
 *
 * Principe :
 *  - WON  → détectable dès que le score change dans la bonne période
 *  - LOST → seulement quand la période se ferme (HT passé / match terminé)
 */
export function resolveOutcome(
  bet: ResolvableBet,
  state: FinalMatchState,
): 'WON' | 'LOST' | null {
  // Match annulé / reporté / interrompu → coupon perdu
  if (VOID_STATUSES.has(state.statusShort)) return 'LOST';

  const isHome = bet.isHomeTeam;

  // ── Buts 1ère mi-temps ──────────────────────────────────────
  // WON dès qu'un but est marqué pendant la 1H (score live > 0 pour l'équipe)
  // LOST quand la MT est terminée et le score HT = 0
  if (bet.marketType === 'Buts 1ère mi-temps') {
    // Pendant la 1H : vérifier le score live
    if (FIRST_HALF_STATUSES.includes(state.statusShort)) {
      const liveScore = isHome ? state.scoreHome : state.scoreAway;
      if (liveScore != null && liveScore > 0) return 'WON';
      return null; // 1H en cours, pas encore de but
    }
    // Après la 1H : score HT définitif disponible
    if (POST_HT_STATUSES.has(state.statusShort)) {
      const htScore = isHome ? state.htScoreHome : state.htScoreAway;
      if (htScore === null) return null; // score HT manquant, attendre
      return htScore > 0 ? 'WON' : 'LOST';
    }
    return null;
  }

  // ── Buts match ──────────────────────────────────────────────
  // WON dès qu'un but est marqué à n'importe quel moment du match
  // LOST seulement quand le match est terminé avec score = 0
  if (bet.marketType === 'Buts match') {
    const teamScore = isHome ? state.scoreHome : state.scoreAway;
    if (teamScore != null && teamScore > 0) return 'WON'; // but déjà marqué → WON immédiat
    if (FINISHED_STATUSES.has(state.statusShort)) return 'LOST'; // match fini, score = 0
    return null; // match en cours, score = 0 pour l'instant
  }

  // ── Buts 2ème mi-temps ──────────────────────────────────────
  // WON dès qu'un but est marqué en 2H (score actuel - score HT > 0)
  // LOST seulement quand le match est terminé sans but en 2H
  if (bet.marketType === 'Buts 2ème mi-temps') {
    const currentScore = isHome ? state.scoreHome : state.scoreAway;
    const htScore = isHome ? state.htScoreHome : state.htScoreAway;

    if (currentScore != null && htScore !== null) {
      // Calcul des buts marqués depuis la MT (valable en live et en fin de match)
      const secondHalfGoals = currentScore - htScore;
      if (secondHalfGoals > 0) return 'WON'; // but en 2MT déjà marqué → WON immédiat
    } else if (currentScore != null && htScore === null) {
      // Score HT inconnu : si le match est fini et score > 0, WON
      if (FINISHED_STATUSES.has(state.statusShort) && currentScore > 0)
        return 'WON';
    }

    if (FINISHED_STATUSES.has(state.statusShort)) return 'LOST'; // match fini, pas de but en 2MT
    return null; // 2H en cours, pas encore de but en 2MT
  }

  return null;
}
