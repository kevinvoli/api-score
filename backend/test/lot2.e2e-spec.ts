import { Controller, Get, INestApplication, Param, Query, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AsyncContextService } from '../src/common/async-context.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JsonLogger } from '../src/common/json.logger';
import { RequestLoggingMiddleware } from '../src/common/middleware/request-logging.middleware';
import { TraceIdMiddleware } from '../src/common/middleware/trace-id.middleware';
import { GetLiveFixturesQueryDto } from '../src/fixtures/dto/get-live-fixtures-query.dto';

const getLatestFixturesMock = jest.fn();

@Controller('live/fixtures')
class FixturesLot2TestController {
  @Get()
  getLatestFixtures(@Query() query: GetLiveFixturesQueryDto) {
    return getLatestFixturesMock(query);
  }

  @Get(':fixtureId/detail')
  getDetail(@Param('fixtureId') fixtureId: string) {
    return { fixtureId };
  }

  @Get(':fixtureId/summary')
  getSummary(@Param('fixtureId') fixtureId: string) {
    return {
      fixture: { providerFixtureId: fixtureId },
      momentum: { dominantSide: 'balanced' },
      dataQuality: { flags: [] },
      confidence: 77,
    };
  }
}

describe('Lot2 (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    getLatestFixturesMock.mockReset();
    getLatestFixturesMock.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [FixturesLot2TestController],
      providers: [AsyncContextService, JsonLogger, AllExceptionsFilter],
    }).compile();

    app = moduleFixture.createNestApplication();
    const asyncContext = app.get(AsyncContextService);
    const logger = app.get(JsonLogger);
    const filter = app.get(AllExceptionsFilter);

    app.useLogger(logger);
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(filter);

    const traceIdMiddleware = new TraceIdMiddleware(asyncContext);
    const requestLoggingMiddleware = new RequestLoggingMiddleware(logger);
    app.use(traceIdMiddleware.use.bind(traceIdMiddleware));
    app.use(requestLoggingMiddleware.use.bind(requestLoggingMiddleware));

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /v1/live/fixtures accepts pagination and filters', async () => {
    await request(app.getHttpServer())
      .get('/v1/live/fixtures?page=2&limit=10&leagueId=39&sortBy=elapsed&sortOrder=ASC')
      .expect(200);

    expect(getLatestFixturesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 10,
        leagueId: 39,
        sortBy: 'elapsed',
        sortOrder: 'ASC',
      }),
    );
  });

  it('GET /v1/live/fixtures rejects invalid query values', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/live/fixtures?limit=5000')
      .expect(400);

    expect(response.body.code).toBe('BAD_REQUEST');
    expect(response.body.traceId).toBeDefined();
  });

  it('GET /v1/live/fixtures/:fixtureId/summary returns summary payload', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/live/fixtures/9001/summary')
      .expect(200);

    expect(response.body).toEqual({
      fixture: { providerFixtureId: '9001' },
      momentum: { dominantSide: 'balanced' },
      dataQuality: { flags: [] },
      confidence: 77,
    });
  });
});
