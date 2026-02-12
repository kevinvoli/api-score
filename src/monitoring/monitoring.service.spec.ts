import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  const dataSourceMock = {
    query: jest.fn(),
  };

  const queryBuilderMock = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
  };

  const repositoryMock = {
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    findOne: jest.fn(),
  };

  const service = new MonitoringService(
    dataSourceMock as any,
    repositoryMock as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ok health when db is reachable', async () => {
    dataSourceMock.query.mockResolvedValueOnce([{ '?column?': 1 }]);

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
    expect(typeof result.uptime).toBe('number');
    expect(typeof result.time).toBe('string');
  });

  it('returns degraded health when db is down', async () => {
    dataSourceMock.query.mockRejectedValueOnce(new Error('db down'));

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.db).toBe('down');
  });

  it('returns usage metrics payload', async () => {
    const calledAt = new Date('2026-02-12T16:00:00.000Z');
    repositoryMock.count.mockResolvedValueOnce(25);
    queryBuilderMock.getCount.mockResolvedValueOnce(3);
    repositoryMock.findOne.mockResolvedValueOnce({ calledAt });

    const result = await service.getUsageMetrics();

    expect(result).toEqual({
      apiCallsLastHour: 25,
      apiErrorsLastHour: 3,
      lastProviderCallAt: '2026-02-12T16:00:00.000Z',
    });
  });
});
