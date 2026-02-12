import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { ApiFootballClient } from './api-football.client';

describe('ApiFootballClient', () => {
  const httpServiceMock = {
    get: jest.fn(),
  } as unknown as HttpService;
  const configServiceMock = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const configMap: Record<string, unknown> = {
        API_FOOTBALL_BASE_URL: 'https://v3.football.api-sports.io',
        API_FOOTBALL_KEY: 'test-key',
        API_FOOTBALL_HOST: 'v3.football.api-sports.io',
        RETRY_MAX: 1,
        REQUEST_TIMEOUT_MS: 3000,
      };
      return configMap[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;
  const loggerMock = { log: jest.fn(), error: jest.fn() };
  const apiUsageLogRepositoryMock = {
    insert: jest.fn(),
  };

  const client = new ApiFootballClient(
    httpServiceMock,
    configServiceMock,
    loggerMock as any,
    apiUsageLogRepositoryMock as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns live fixtures and logs usage', async () => {
    httpServiceMock.get = jest.fn().mockReturnValue(
      of({
        status: 200,
        data: { response: [{ fixture: { id: 101 } }] },
        headers: { 'x-ratelimit-requests-remaining': '250' },
      }),
    );

    const result = await client.fetchLiveFixtures();

    expect(result).toEqual([{ fixture: { id: 101 } }]);
    expect(apiUsageLogRepositoryMock.insert).toHaveBeenCalledTimes(1);
  });

  it('retries once on provider error', async () => {
    httpServiceMock.get = jest
      .fn()
      .mockReturnValueOnce(
        throwError(() => ({
          response: { status: 429, headers: {} },
        })),
      )
      .mockReturnValueOnce(
        of({
          status: 200,
          data: { response: [] },
          headers: {},
        }),
      );

    const result = await client.fetchLiveFixtures();

    expect(result).toEqual([]);
    expect(httpServiceMock.get).toHaveBeenCalledTimes(2);
    expect(apiUsageLogRepositoryMock.insert).toHaveBeenCalledTimes(2);
  });
});
