import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import { lastValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { JsonLogger } from '../../common/json.logger';
import { ApiUsageLog } from '../../database/entities/api-usage-log.entity';

type QueryParams = Record<string, unknown>;

@Injectable()
export class ApiFootballClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: JsonLogger,
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
  ) {}

  async fetchLiveFixtures(): Promise<any[]> {
    const data = await this.get('/fixtures', { live: 'all' }, 'fixtures_live');
    return Array.isArray(data) ? data : [];
  }

  async fetchFixturesByIds(ids: number[]): Promise<any[]> {
    if (!ids.length) {
      return [];
    }

    const data = await this.get(
      '/fixtures',
      { ids: ids.slice(0, 20).join('-') },
      'fixtures_by_ids',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchFixtureEvents(fixtureId: number): Promise<any[]> {
    const data = await this.get(
      '/fixtures/events',
      { fixture: fixtureId },
      'fixture_events',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchFixtureStatistics(
    fixtureId: number,
    half?: 'first' | 'second',
  ): Promise<any[]> {
    const params: QueryParams = { fixture: fixtureId };
    if (half) {
      params.half = half;
    }
    const data = await this.get('/fixtures/statistics', params, 'fixture_statistics');
    return Array.isArray(data) ? data : [];
  }

  async fetchFixtureLineups(fixtureId: number): Promise<any[]> {
    const data = await this.get(
      '/fixtures/lineups',
      { fixture: fixtureId },
      'fixture_lineups',
    );
    return Array.isArray(data) ? data : [];
  }

  async fetchFixturePlayers(fixtureId: number): Promise<any[]> {
    const data = await this.get(
      '/fixtures/players',
      { fixture: fixtureId },
      'fixture_players',
    );
    return Array.isArray(data) ? data : [];
  }

  private async get(
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

        return this.unwrapResponse(response.data);
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
    });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
