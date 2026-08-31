import {
  SmartRulesConfig,
  HalfRule,
  SignalType,
} from '../../settings/smart-rules-config.service';

export const FIRST_HALF_STATUSES = ['1H', 'LIVE'];
export const SECOND_HALF_STATUSES = ['2H', 'LIVE'];

export interface TeamInputSignals {
  teamId: number;
  teamName: string;
  totalShots: number | null;
  /** Optionnels : présents dès que l'adaptateur les alimente (LOT 3). */
  shotsOnTarget?: number | null;
  pressureIndex?: number | null;
}

export interface RuleEvaluationInput {
  elapsed: number;
  statusShort: string;
  home: TeamInputSignals;
  away: TeamInputSignals;
  /** Baselines cumulées à la mi-temps, une par signal (base de calcul 2MT). */
  htShots?: { home: number; away: number };
  htOnTarget?: { home: number; away: number };
  htPressure?: { home: number; away: number };
  /** Score courant, pour la modulation par état du match (LOT 3.4). */
  scoreHome?: number | null;
  scoreAway?: number | null;
  liveOdd: number | null;
}

/** Valeur du signal choisi pour une équipe (null = donnée absente → pas de déclenchement). */
function signalValue(
  team: TeamInputSignals,
  signal: SignalType,
): number | null {
  switch (signal) {
    case 'ON_TARGET':
      return team.shotsOnTarget ?? null;
    case 'PRESSURE_INDEX':
      return team.pressureIndex ?? null;
    default:
      return team.totalShots;
  }
}

export interface RuleMatch {
  teamId: number;
  isHomeTeam: boolean;
  teamName: string;
  marketType: string;
  selection: string;
  ruleName: string;
  currentOdd: number;
  minAcceptableOdd: number;
  edgePct: number;
  confidenceScore: number;
  /** Seuil (`minShots`) de la règle déclenchée — clé de lookup du taux de base. */
  signalThreshold: number;
  /** Signal ayant déclenché la règle — sélectionne le bon taux de base (LOT 3). */
  signal: SignalType;
  reasons: string[];
  elapsed: number;
  shotsCount: number;
}

type TeamInput = RuleEvaluationInput['home'];

function findMatchedRule(
  rules: HalfRule[],
  elapsed: number,
  shots: number,
  thresholdOffset = 0,
): HalfRule | undefined {
  return rules.find(
    (r) => elapsed < r.maxElapsed && shots >= r.minShots + thresholdOffset,
  );
}

type ScoreState = 'leading' | 'trailing' | 'drawing';

/** État au score d'une équipe. `drawing` (neutre) si le score est inconnu. */
function scoreStateOf(
  input: RuleEvaluationInput,
  isHomeTeam: boolean,
): ScoreState {
  const gf = isHomeTeam ? input.scoreHome : input.scoreAway;
  const ga = isHomeTeam ? input.scoreAway : input.scoreHome;
  if (gf === null || gf === undefined || ga === null || ga === undefined) {
    return 'drawing';
  }
  if (gf > ga) return 'leading';
  if (gf < ga) return 'trailing';
  return 'drawing';
}

/** Décalage de seuil (LOT 3.4) pour l'état au score de l'équipe. */
function thresholdOffsetFor(
  input: RuleEvaluationInput,
  config: SmartRulesConfig,
  isHomeTeam: boolean,
): number {
  const mods = config.scoreStateModifiers;
  if (!mods) return 0;
  return mods[scoreStateOf(input, isHomeTeam)];
}

/** Baseline mi-temps du signal choisi, par côté (0 si absente). */
function htBaselineFor(
  input: RuleEvaluationInput,
  signal: SignalType,
): { home: number; away: number } {
  const source =
    signal === 'ON_TARGET'
      ? input.htOnTarget
      : signal === 'PRESSURE_INDEX'
        ? input.htPressure
        : input.htShots;
  return { home: source?.home ?? 0, away: source?.away ?? 0 };
}

function evaluateFirstHalf(
  input: RuleEvaluationInput,
  config: SmartRulesConfig,
): RuleMatch[] {
  const rules = config.firstHalfRules;
  const maxWindow = Math.max(...rules.map((r) => r.maxElapsed));
  if (
    !FIRST_HALF_STATUSES.includes(input.statusShort) ||
    input.elapsed < 1 ||
    input.elapsed >= maxWindow
  ) {
    return [];
  }

  const oddsHT = config.odds.firstHalfHT;
  const oddsFT = config.odds.firstHalfFT;
  const signal = config.signal ?? 'TOTAL_SHOTS';
  const matches: RuleMatch[] = [];

  const teams: [TeamInput, boolean][] = [
    [input.home, true],
    [input.away, false],
  ];

  for (const [team, isHomeTeam] of teams) {
    const value = signalValue(team, signal);
    if (value === null) continue;
    const shots = value;
    const offset = thresholdOffsetFor(input, config, isHomeTeam);
    const matchedRule = findMatchedRule(rules, input.elapsed, shots, offset);
    if (!matchedRule) continue;
    const effectiveThreshold = matchedRule.minShots + offset;

    matches.push({
      teamId: team.teamId,
      isHomeTeam,
      teamName: team.teamName,
      ruleName: 'shots-pressure',
      elapsed: input.elapsed,
      shotsCount: shots,
      marketType: 'Buts 1ère mi-temps',
      selection: `${team.teamName} marque avant la mi-temps (+0.5)`,
      currentOdd: input.liveOdd ?? oddsHT.current,
      minAcceptableOdd: oddsHT.min,
      edgePct: oddsHT.edgePct,
      confidenceScore: oddsHT.confidence,
      signalThreshold: effectiveThreshold,
      signal,
      reasons: [
        `${shots} tirs à ${input.elapsed}' (seuil : ≥${effectiveThreshold} avant ${matchedRule.maxElapsed}')`,
        'Forte pression offensive',
        'Probabilité accrue de marquer avant la mi-temps',
      ],
    });

    matches.push({
      teamId: team.teamId,
      isHomeTeam,
      teamName: team.teamName,
      ruleName: 'shots-pressure',
      elapsed: input.elapsed,
      shotsCount: shots,
      marketType: 'Buts match',
      selection: `${team.teamName} marque dans le match (+0.5)`,
      currentOdd: input.liveOdd ?? oddsFT.current,
      minAcceptableOdd: oddsFT.min,
      edgePct: oddsFT.edgePct,
      confidenceScore: oddsFT.confidence,
      signalThreshold: effectiveThreshold,
      signal,
      reasons: [
        `${shots} tirs à ${input.elapsed}' (seuil : ≥${effectiveThreshold} avant ${matchedRule.maxElapsed}')`,
        'Domination offensive confirmée',
        'Haute probabilité de scorer sur 90 minutes',
      ],
    });
  }

  return matches;
}

function evaluateSecondHalf(
  input: RuleEvaluationInput,
  config: SmartRulesConfig,
): RuleMatch[] {
  const rule = config.secondHalfRule;
  if (
    !SECOND_HALF_STATUSES.includes(input.statusShort) ||
    input.elapsed < 45 ||
    input.elapsed >= rule.maxElapsed
  ) {
    return [];
  }

  const odds = config.odds.secondHalf;
  const signal = config.signal ?? 'TOTAL_SHOTS';
  const baseline = htBaselineFor(input, signal);
  const matches: RuleMatch[] = [];

  const teams: [TeamInput, boolean, number][] = [
    [input.home, true, baseline.home],
    [input.away, false, baseline.away],
  ];

  for (const [team, isHomeTeam, htBaseline] of teams) {
    const value = signalValue(team, signal);
    if (value === null) continue;
    const shots = Math.max(0, value - htBaseline);
    const offset = thresholdOffsetFor(input, config, isHomeTeam);
    const matchedRule = findMatchedRule([rule], input.elapsed, shots, offset);
    if (!matchedRule) continue;
    const effectiveThreshold = matchedRule.minShots + offset;

    matches.push({
      teamId: team.teamId,
      isHomeTeam,
      teamName: team.teamName,
      ruleName: 'shots-pressure',
      elapsed: input.elapsed,
      shotsCount: shots,
      marketType: 'Buts 2ème mi-temps',
      selection: `${team.teamName} marque en 2ème mi-temps (+0.5)`,
      currentOdd: input.liveOdd ?? odds.current,
      minAcceptableOdd: odds.min,
      edgePct: odds.edgePct,
      confidenceScore: odds.confidence,
      signalThreshold: effectiveThreshold,
      signal,
      reasons: [
        `${shots} tirs en 2MT à ${input.elapsed}' (seuil : ≥${effectiveThreshold} avant ${matchedRule.maxElapsed}')`,
        'Pression offensive confirmée en 2ème mi-temps',
        'Fort potentiel de marquer avant la fin du match',
      ],
    });
  }

  return matches;
}

/**
 * Évaluateur pur : reproduit à l'identique la logique des règles de
 * SmartSuggestionsService (1ère et 2ème mi-temps) sans aucun accès DB,
 * pour garantir que live et rejeu (backtest) exécutent le même code.
 */
export function evaluateRules(
  input: RuleEvaluationInput,
  config: SmartRulesConfig,
): RuleMatch[] {
  return [
    ...evaluateFirstHalf(input, config),
    ...evaluateSecondHalf(input, config),
  ];
}
