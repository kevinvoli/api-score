import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import { lastValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { JsonLogger } from '../../common/json.logger';
import { ApiUsageLog } from '../../database/entities/api-usage-log.entity';
import { ApiFootballPayload } from '../../database/entities/api-football-payload.entity';

type QueryParams = Record<string, unknown>;

@Injectable()
export class ApiFootballClient {
  private readonly provider: 'apisports' | 'apifootball';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: JsonLogger,
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
    @InjectRepository(ApiFootballPayload)
    private readonly payloadRepository: Repository<ApiFootballPayload>,
  ) {
    const configured = this.configService.get<string>('API_FOOTBALL_VENDOR');
    this.provider =
      configured && configured.toLowerCase() === 'apifootball'
        ? 'apifootball'
        : 'apisports';
  }

  async fetchLiveFixtures(): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const today = this.formatDate(new Date());
      const timezone = this.configService.get<string>('API_FOOTBALL_TIMEZONE');
      const data = await this.getApifootball(
        'get_events',
        {
          from: today,
          to: today,
          match_live: 1,
          ...(timezone ? { timezone } : {}),
        },
        'fixtures_live',
      );
      return Array.isArray(data) ? data : [];
    }

    const data = await this.getApiSports(
      '/fixtures',
      { live: 'all' },
      'fixtures_live',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchFixturesByIds(ids: number[]): Promise<any[]> {
    if (!ids.length) {
      return [];
    }

    if (this.provider === 'apifootball') {
      const batches = ids.slice(0, 20);
      const responses = await Promise.all(
        batches.map((id) =>
          this.getApifootball('get_events', { match_id: id }, 'fixtures_by_ids'),
        ),
      );
      return responses.flatMap((data) => (Array.isArray(data) ? data : []));
    }

    const data = await this.getApiSports(
      '/fixtures',
      { ids: ids.slice(0, 20).join('-') },
      'fixtures_by_ids',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchFixtureEvents(fixtureId: number): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const data = await this.getApifootball(
        'get_events',
        { match_id: fixtureId },
        'fixture_events',
      );
      const match = Array.isArray(data) ? data[0] : null;
      return this.normalizeApifootballEvents(match);
    }

    const data = await this.getApiSports(
      '/fixtures/events',
      { fixture: fixtureId },
      'fixture_events',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchFixtureStatistics(
    fixtureId: number,
    half?: 'first' | 'second',
    teamIds?: { homeTeamId: number | null; awayTeamId: number | null },
  ): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const data = await this.getApifootball(
        'get_statistics',
        { match_id: fixtureId },
        'fixture_statistics',
      );
      return this.normalizeApifootballStatistics(data, fixtureId, teamIds);
    }

    const params: QueryParams = { fixture: fixtureId };
    if (half) {
      params.half = half;
    }
    const data = await this.getApiSports(
      '/fixtures/statistics',
      params,
      'fixture_statistics',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchFixtureLineups(
    fixtureId: number,
    teamIds?: { homeTeamId: number | null; awayTeamId: number | null },
  ): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const data = await this.getApifootball(
        'get_lineups',
        { match_id: fixtureId },
        'fixture_lineups',
      );
      return this.normalizeApifootballLineups(data, fixtureId, teamIds);
    }

    const data = await this.getApiSports(
      '/fixtures/lineups',
      { fixture: fixtureId },
      'fixture_lineups',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchFixturePlayers(
    fixtureId: number,
    teamIds?: { homeTeamId: number | null; awayTeamId: number | null },
  ): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const data = await this.getApifootball(
        'get_statistics',
        { match_id: fixtureId },
        'fixture_players',
      );
      return this.normalizeApifootballPlayers(data, fixtureId, teamIds);
    }

    const data = await this.getApiSports(
      '/fixtures/players',
      { fixture: fixtureId },
      'fixture_players',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchTeamsByLeague(leagueId: number): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const data = await this.getApifootball(
        'get_teams',
        { league_id: leagueId },
        'teams_by_league',
      );
      return Array.isArray(data) ? data : [];
    }

    const data = await this.getApiSports('/teams', { league: leagueId }, 'teams_by_league');
    return Array.isArray(data) ? data : [];
  }

  async fetchCountries(): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const data = await this.getApifootball('get_countries', {}, 'countries');
      return Array.isArray(data) ? data : [];
    }

    const data = await this.getApiSports('/countries', {}, 'countries');
    return Array.isArray(data) ? data : [];
  }

  async fetchLeagues(countryId?: number): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const params: QueryParams = {};
      if (countryId !== undefined && countryId !== null) {
        params.country_id = countryId;
      }
      const data = await this.getApifootball('get_leagues', params, 'leagues');
      return Array.isArray(data) ? data : [];
    }

    const params: QueryParams = {};
    if (countryId !== undefined && countryId !== null) {
      params.country = countryId;
    }
    const data = await this.getApiSports('/leagues', params, 'leagues');
    return Array.isArray(data) ? data : [];
  }

  async fetchStandings(leagueId: number): Promise<any[]> {
    if (this.provider === 'apifootball') {
      const data = await this.getApifootball(
        'get_standings',
        { league_id: leagueId },
        'standings',
      );
      return Array.isArray(data) ? data : [];
    }

    const data = await this.getApiSports(
      '/standings',
      { league: leagueId },
      'standings',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchLeagueFixtures(leagueId: number, from?: string, to?: string): Promise<any[]> {
    const { seasonFrom, seasonTo, seasonYear } = this.currentSeasonRange();
    const dateFrom = from ?? seasonFrom;
    const dateTo   = to   ?? seasonTo;
    const timezone = this.configService.get<string>('API_FOOTBALL_TIMEZONE');

    if (this.provider === 'apifootball') {
      const data = await this.getApifootball(
        'get_events',
        {
          league_id: leagueId,
          from: dateFrom,
          to: dateTo,
          ...(timezone ? { timezone } : {}),
        },
        'league_fixtures',
      );
      return Array.isArray(data) ? data : [];
    }

    const data = await this.getApiSports(
      '/fixtures',
      { league: leagueId, season: seasonYear },
      'league_fixtures',
    );
    return Array.isArray(data) ? data : [];
  }

  /** Calcule la plage de la saison en cours (juillet → juin). */
  private currentSeasonRange(): { seasonFrom: string; seasonTo: string; seasonYear: number } {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year  = now.getFullYear();
    // Saison démarre en juillet : si on est juil-déc → saison year/(year+1), sinon (year-1)/year
    const seasonYear = month >= 7 ? year : year - 1;
    return {
      seasonYear,
      seasonFrom: `${seasonYear}-07-01`,
      seasonTo:   `${seasonYear + 1}-06-30`,
    };
  }

  /**
   * Récupère les cotes live + commentaires pour un match donné (apifootball uniquement).
   * Retourne null si le provider n'est pas apifootball ou en cas d'erreur.
   */
  async fetchLiveOddsForMatch(matchId: number): Promise<{
    ou05Over: number | null;
    ou05Under: number | null;
  } | null> {
    if (this.provider !== 'apifootball') return null;
    try {
      const data = await this.getApifootball(
        'get_live_odds_commnets',
        { match_id: matchId },
        'live_odds',
      );
      return this.extractOU05Odds(data);
    } catch {
      return null;
    }
  }

  /**
   * Récupère toutes les cotes O/U live (sans filtre match).
   * Retourne une Map : providerMatchId → { ou05Over, ou05Under }
   */
  async fetchAllLiveOdds(): Promise<Map<number, { ou05Over: number | null; ou05Under: number | null }>> {
    if (this.provider !== 'apifootball') return new Map();
    try {
      const data = await this.getApifootball('get_live_odds_commnets', {}, 'live_odds_all');
      const result = new Map<number, { ou05Over: number | null; ou05Under: number | null }>();
      if (!Array.isArray(data)) return result;
      for (const entry of data as Record<string, unknown>[]) {
        const id = this.toNumber(entry.match_id);
        if (id === null) continue;
        const odds = this.extractOU05Odds(entry);
        if (odds) result.set(id, odds);
      }
      return result;
    } catch {
      return new Map();
    }
  }

  /**
   * Extrait les cotes Over/Under 0.5 buts depuis un objet de réponse apifootball.
   * Tente plusieurs formats connus.
   */
  private extractOU05Odds(entry: unknown): { ou05Over: number | null; ou05Under: number | null } | null {
    if (!entry || typeof entry !== 'object') return null;
    const obj = entry as Record<string, unknown>;

    // Format 1 : tableau bets[].values[]
    const bets = obj['bets'];
    if (Array.isArray(bets)) {
      for (const bet of bets as Record<string, unknown>[]) {
        const name = String(bet['name'] ?? '').toLowerCase();
        if (!name.includes('over') || !name.includes('under')) continue;
        const values = bet['values'];
        if (!Array.isArray(values)) continue;
        let over: number | null = null;
        let under: number | null = null;
        for (const v of values as Record<string, unknown>[]) {
          const label = String(v['value'] ?? '').toLowerCase();
          const n = this.toNumber(v['odd'] ?? v['value2']);
          if (label.includes('over 0.5') || label === 'over') over = n;
          if (label.includes('under 0.5') || label === 'under') under = n;
        }
        if (over !== null || under !== null) return { ou05Over: over, ou05Under: under };
      }
    }

    // Format 2 : champs plats over / under
    const overFlat = this.toNumber(obj['over_0_5'] ?? obj['over05'] ?? obj['over']);
    const underFlat = this.toNumber(obj['under_0_5'] ?? obj['under05'] ?? obj['under']);
    if (overFlat !== null || underFlat !== null) {
      return { ou05Over: overFlat, ou05Under: underFlat };
    }

    return null;
  }

  async fetchTeamById(teamId: number): Promise<any | null> {
    if (this.provider === 'apifootball') {
      const data = await this.getApifootball(
        'get_teams',
        { team_id: teamId },
        'team_by_id',
      );
      return Array.isArray(data) ? data[0] ?? null : null;
    }

    const data = await this.getApiSports('/teams', { id: teamId }, 'team_by_id');
    return Array.isArray(data) ? data[0] ?? null : null;
  }

  private async getApiSports(
    path: string,
    params: QueryParams,
    usageEndpoint: string,
  ): Promise<unknown> {
    const baseUrl = this.configService.get<string>('API_FOOTBALL_BASE_URL')!;
    const apiKey = this.configService.get<string>('API_FOOTBALL_KEY')!;
    const host = this.configService.get<string>('API_FOOTBALL_HOST')!;
    const retryMax = this.configService.get<number>('RETRY_MAX', 3);
    const timeout = this.configService.get<number>('REQUEST_TIMEOUT_MS', 30000);
    const url = `${baseUrl}${path}`;
    const headers = {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': host,
      'x-apisports-key': apiKey,
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retryMax; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await lastValueFrom(
          this.httpService.get(url, {
            headers,
            params,
            timeout,
          }),
        );

        await this.logUsage({
          endpoint: usageEndpoint,
          params,
          status: response.status,
          latencyMs: Date.now() - startedAt,
          rateLimitRemaining: this.extractRateLimitRemaining(response.headers),
        });

        const unwrapped = this.unwrapResponse(response.data);
        await this.storePayload({
          endpoint: usageEndpoint,
          params,
          payload: unwrapped,
        });
        return unwrapped;
      } catch (error) {
        lastError = error;
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status ?? 500;

        await this.logUsage({
          endpoint: usageEndpoint,
          params,
          status,
          latencyMs: Date.now() - startedAt,
          rateLimitRemaining: this.extractRateLimitRemaining(
            axiosError.response?.headers,
          ),
        });

        if (!this.shouldRetry(axiosError, attempt, retryMax)) {
          break;
        }

        await this.sleep(250 * (attempt + 1));
      }
    }

    this.logger.error(
      {
        event: 'provider_request_failed',
        endpoint: usageEndpoint,
        params,
      },
      lastError instanceof Error ? lastError.stack : undefined,
      'ApiFootballClient',
    );

    throw lastError;
  }

  private async getApifootball(
    action: string,
    params: QueryParams,
    usageEndpoint: string,
  ): Promise<unknown> {
    const baseUrl = this.configService.get<string>('API_FOOTBALL_BASE_URL')!;
    const apiKey = this.configService.get<string>('API_FOOTBALL_KEY')!;
    const retryMax = this.configService.get<number>('RETRY_MAX', 3);
    const timeout = this.configService.get<number>('REQUEST_TIMEOUT_MS', 30000);

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retryMax; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await lastValueFrom(
          this.httpService.get(baseUrl, {
            params: {
              action,
              APIkey: apiKey,
              ...params,
            },
            timeout,
          }),
        );


        
        await this.logUsage({
          endpoint: usageEndpoint,
          params,
          status: response.status,
          latencyMs: Date.now() - startedAt,
          rateLimitRemaining: null,
        });

        await this.storePayload({
          endpoint: usageEndpoint,
          params,
          payload: response.data,
        });
        return response.data;
      } catch (error) {
        lastError = error;
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status ?? 500;

        await this.logUsage({
          endpoint: usageEndpoint,
          params,
          status,
          latencyMs: Date.now() - startedAt,
          rateLimitRemaining: null,
        });

        if (!this.shouldRetry(axiosError, attempt, retryMax)) {
          break;
        }

        await this.sleep(250 * (attempt + 1));
      }
    }

    this.logger.error(
      {
        event: 'provider_request_failed',
        endpoint: usageEndpoint,
        params,
      },
      lastError instanceof Error ? lastError.stack : undefined,
      'ApiFootballClient',
    );

    throw lastError;
  }

  private unwrapResponse(payload: unknown): unknown {
    if (
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      'response' in payload
    ) {
      return (payload as { response: unknown }).response;
    }

    return payload;
  }

  private shouldRetry(error: AxiosError, attempt: number, retryMax: number): boolean {
    if (attempt >= retryMax) {
      return false;
    }

    const status = error.response?.status;
    return !status || status === 429 || status >= 500;
  }

  private extractRateLimitRemaining(headers?: unknown): number | null {
    if (!headers || typeof headers !== 'object') {
      return null;
    }

    const candidate =
      (headers as Record<string, string>)['x-ratelimit-requests-remaining'] ??
      (headers as Record<string, string>)['x-ratelimit-remaining'];

    if (!candidate) {
      return null;
    }

    const parsed = Number(candidate);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private async logUsage(input: {
    endpoint: string;
    params: QueryParams;
    status: number;
    latencyMs: number;
    rateLimitRemaining: number | null;
  }): Promise<void> {
    await this.apiUsageLogRepository.insert({
      provider: 'api-football',
      endpoint: input.endpoint,
      requestParams: input.params,
      responseStatus: input.status,
      latencyMs: input.latencyMs,
      rateLimitRemaining: input.rateLimitRemaining,
      calledAt: new Date(),
    });
  }

  private async storePayload(input: {
    endpoint: string;
    params: QueryParams;
    payload: unknown;
  }): Promise<void> {
    const matchId =
      this.toStringParam(input.params?.fixture) ??
      this.toStringParam(input.params?.match_id) ??
      this.toStringParam((input.params as Record<string, unknown>)?.ids);

    const leagueId = this.toNumberParam(input.params?.league);
    const teamId = this.toNumberParam(input.params?.team);

    try {
      await this.payloadRepository.insert({
        provider: this.provider,
        endpoint: input.endpoint,
        params: input.params,
        payload: Array.isArray(input.payload)
          ? input.payload
          : (input.payload as Record<string, unknown>),
        matchId,
        leagueId,
        teamId,
      });
    } catch (error) {
      this.logger.error(
        {
          event: 'payload_store_failed',
          endpoint: input.endpoint,
          params: input.params,
        },
        error instanceof Error ? error.stack : undefined,
        'ApiFootballClient',
      );
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeApifootballEvents(match: Record<string, any> | null): any[] {
    if (!match) {
      return [];
    }

    const homeTeamId = this.toNumber(match.match_hometeam_id);
    const awayTeamId = this.toNumber(match.match_awayteam_id);
    const events: Array<Record<string, unknown>> = [];

    const goals = Array.isArray(match.goalscorer) ? match.goalscorer : [];
    for (const goal of goals) {
      const minute = this.toNumber(goal.time);
      if (goal.home_scorer) {
        events.push({
          team_id: homeTeamId,
          player_id: this.toNumber(goal.home_scorer_id),
          minute,
          extra: null,
          eventType: 'Goal',
          detail: goal.info || 'Goal',
          raw: goal,
        });
      }
      if (goal.away_scorer) {
        events.push({
          team_id: awayTeamId,
          player_id: this.toNumber(goal.away_scorer_id),
          minute,
          extra: null,
          eventType: 'Goal',
          detail: goal.info || 'Goal',
          raw: goal,
        });
      }
    }

    const cards = Array.isArray(match.cards) ? match.cards : [];
    for (const card of cards) {
      const minute = this.toNumber(card.time);
      if (card.home_fault) {
        events.push({
          team_id: homeTeamId,
          player_id: this.toNumber(card.home_player_id),
          minute,
          extra: null,
          eventType: 'Card',
          detail: card.card ?? 'card',
          raw: card,
        });
      }
      if (card.away_fault) {
        events.push({
          team_id: awayTeamId,
          player_id: this.toNumber(card.away_player_id),
          minute,
          extra: null,
          eventType: 'Card',
          detail: card.card ?? 'card',
          raw: card,
        });
      }
    }

    const substitutions = match.substitutions ?? {};
    const homeSubs = Array.isArray(substitutions.home) ? substitutions.home : [];
    for (const sub of homeSubs) {
      events.push({
        team_id: homeTeamId,
        player_id: this.extractSubPlayerId(sub?.substitution_player_id, 0),
        minute: this.toNumber(sub.time),
        extra: null,
        eventType: 'Substitution',
        detail: sub.substitution,
        raw: sub,
      });
    }
    const awaySubs = Array.isArray(substitutions.away) ? substitutions.away : [];
    for (const sub of awaySubs) {
      events.push({
        team_id: awayTeamId,
        player_id: this.extractSubPlayerId(sub?.substitution_player_id, 0),
        minute: this.toNumber(sub.time),
        extra: null,
        eventType: 'Substitution',
        detail: sub.substitution,
        raw: sub,
      });
    }

    return events;
  }

  private normalizeApifootballStatistics(
    payload: unknown,
    fixtureId: number,
    teamIds?: { homeTeamId: number | null; awayTeamId: number | null },
  ): any[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const match =
      (payload as Record<string, any>)[String(fixtureId)] ??
      (payload as Record<string, any>)[fixtureId];
    if (!match || !Array.isArray(match.statistics)) {
      return [];
    }

    const homeTeamId = teamIds?.homeTeamId ?? null;
    const awayTeamId = teamIds?.awayTeamId ?? null;
    const homeStats = match.statistics.map((stat: Record<string, any>) => ({
      type: stat.type,
      value: stat.home,
    }));
    const awayStats = match.statistics.map((stat: Record<string, any>) => ({
      type: stat.type,
      value: stat.away,
    }));

    return [
      { team_id: homeTeamId, statistics: homeStats },
      { team_id: awayTeamId, statistics: awayStats },
    ];
  }

  private normalizeApifootballLineups(
    payload: unknown,
    fixtureId: number,
    teamIds?: { homeTeamId: number | null; awayTeamId: number | null },
  ): any[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const match =
      (payload as Record<string, any>)[String(fixtureId)] ??
      (payload as Record<string, any>)[fixtureId];
    const lineup = match?.lineup ?? null;
    if (!lineup) {
      return [];
    }

    const homeTeamId = teamIds?.homeTeamId ?? null;
    const awayTeamId = teamIds?.awayTeamId ?? null;

    return [
      {
        team_id: homeTeamId,
        formation: null,
        coach: lineup.home?.coach?.[0]?.lineup_player ?? null,
        startXI: lineup.home?.starting_lineups ?? [],
        substitutes: lineup.home?.substitutes ?? [],
        raw: lineup.home ?? lineup,
      },
      {
        team_id: awayTeamId,
        formation: null,
        coach: lineup.away?.coach?.[0]?.lineup_player ?? null,
        startXI: lineup.away?.starting_lineups ?? [],
        substitutes: lineup.away?.substitutes ?? [],
        raw: lineup.away ?? lineup,
      },
    ];
  }

  private normalizeApifootballPlayers(
    payload: unknown,
    fixtureId: number,
    teamIds?: { homeTeamId: number | null; awayTeamId: number | null },
  ): any[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const match =
      (payload as Record<string, any>)[String(fixtureId)] ??
      (payload as Record<string, any>)[fixtureId];
    const players = Array.isArray(match?.player_statistics)
      ? match.player_statistics
      : [];

    if (!players.length) {
      return [];
    }

    const homeTeamId = teamIds?.homeTeamId ?? null;
    const awayTeamId = teamIds?.awayTeamId ?? null;

    const homePlayers = players
      .filter((player: Record<string, any>) => player.team_name === 'home')
      .map((player: Record<string, any>) => ({
        ...player,
        player_id: this.toNumber(player.player_key),
      }));
    const awayPlayers = players
      .filter((player: Record<string, any>) => player.team_name === 'away')
      .map((player: Record<string, any>) => ({
        ...player,
        player_id: this.toNumber(player.player_key),
      }));

    return [
      { team_id: homeTeamId, players: homePlayers },
      { team_id: awayTeamId, players: awayPlayers },
    ];
  }

  private extractSubPlayerId(value: unknown, index: number): number | null {
    if (typeof value !== 'string') {
      return null;
    }
    const parts = value.split('|').map((part) => part.trim());
    return this.toNumber(parts[index]);
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private toNumberParam(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private toStringParam(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
  }
}
