import {
  SmartRulesConfig,
  HalfRule,
} from '../../settings/smart-rules-config.service';

export const FIRST_HALF_STATUSES = ['1H', 'LIVE'];
export const SECOND_HALF_STATUSES = ['2H', 'LIVE'];

export interface RuleEvaluationInput {
  elapsed: number;
  statusShort: string;
  home: { teamId: number; teamName: string; totalShots: number | null };
  away: { teamId: number; teamName: string; totalShots: number | null };
  htShots?: { home: number; away: number };
  liveOdd: number | null;
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
  /** Seuil de tirs (`minShots`) de la règle déclenchée — clé de lookup du taux de base. */
  signalThreshold: number;
  reasons: string[];
  elapsed: number;
  shotsCount: number;
}

type TeamInput = RuleEvaluationInput['home'];

function findMatchedRule(
  rules: HalfRule[],
  elapsed: number,
  shots: number,
): HalfRule | undefined {
  return rules.find((r) => elapsed < r.maxElapsed && shots >= r.minShots);
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
  const matches: RuleMatch[] = [];

  const teams: [TeamInput, boolean][] = [
    [input.home, true],
    [input.away, false],
  ];

  for (const [team, isHomeTeam] of teams) {
    if (team.totalShots === null) continue;
    const shots = team.totalShots;
    const matchedRule = findMatchedRule(rules, input.elapsed, shots);
    if (!matchedRule) continue;

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
      signalThreshold: matchedRule.minShots,
      reasons: [
        `${shots} tirs à ${input.elapsed}' (seuil : ≥${matchedRule.minShots} avant ${matchedRule.maxElapsed}')`,
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
      signalThreshold: matchedRule.minShots,
      reasons: [
        `${shots} tirs à ${input.elapsed}' (seuil : ≥${matchedRule.minShots} avant ${matchedRule.maxElapsed}')`,
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
  const matches: RuleMatch[] = [];

  const teams: [TeamInput, boolean, number][] = [
    [input.home, true, input.htShots?.home ?? 0],
    [input.away, false, input.htShots?.away ?? 0],
  ];

  for (const [team, isHomeTeam, htBaseline] of teams) {
    if (team.totalShots === null) continue;
    const shots = Math.max(0, team.totalShots - htBaseline);
    const matchedRule = findMatchedRule([rule], input.elapsed, shots);
    if (!matchedRule) continue;

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
      signalThreshold: matchedRule.minShots,
      reasons: [
        `${shots} tirs en 2MT à ${input.elapsed}' (seuil : ≥${matchedRule.minShots} avant ${matchedRule.maxElapsed}')`,
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
