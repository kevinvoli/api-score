export const DEFAULT_MAX_QUOTE_AGE_MS = 120_000;

export interface ExecutableQuoteIdentity {
  snapshotId: string;
  providerKey: string;
  fixtureId: string;
  providerFixtureId: string;
  bookmakerKey: string;
  marketKey: string;
  selectionKey: string;
}

export interface ExecutableQuote extends ExecutableQuoteIdentity {
  oddValue: number;
  observedAt: Date;
  receivedAt: Date;
  available: boolean;
}

export interface ExecutableQuoteTarget {
  providerFixtureId: string;
  marketKey: string;
  selectionKey: string;
  providerKey?: string;
  bookmakerKey?: string;
}

export interface ExecutableQuoteLookup {
  target: ExecutableQuoteTarget;
  at: Date;
  maxQuoteAgeMs: number;
}

export interface QuoteCandidatesQuery {
  providerFixtureIds: string[];
  receivedFrom: Date;
  receivedTo: Date;
}

export function quoteTargetForRuleMarket(
  providerFixtureId: string,
  marketType: string,
  isHomeTeam: boolean,
): ExecutableQuoteTarget | null {
  const side = isHomeTeam ? 'HOME' : 'AWAY';

  if (marketType === 'Buts 1ère mi-temps') {
    return {
      providerFixtureId,
      marketKey: 'TEAM_GOAL_1H',
      selectionKey: `${side}_YES`,
    };
  }
  if (marketType === 'Buts 2ème mi-temps') {
    return {
      providerFixtureId,
      marketKey: 'TEAM_GOAL_2H',
      selectionKey: `${side}_YES`,
    };
  }
  if (marketType === 'Buts match') {
    return {
      providerFixtureId,
      marketKey: 'TEAM_GOALS_FT',
      selectionKey: `${side}_OVER_0.5`,
    };
  }
  return null;
}
