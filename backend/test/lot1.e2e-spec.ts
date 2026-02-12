import { BadRequestException, Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AsyncContextService } from '../src/common/async-context.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JsonLogger } from '../src/common/json.logger';
import { RequestLoggingMiddleware } from '../src/common/middleware/request-logging.middleware';
import { TraceIdMiddleware } from '../src/common/middleware/trace-id.middleware';
import { MonitoringController } from '../src/monitoring/monitoring.controller';
import { MonitoringService } from '../src/monitoring/monitoring.service';

class MonitoringServiceMock {
  async getHealth() {
    return {
      status: 'ok',
      time: new Date('2026-02-12T00:00:00.000Z').toISOString(),
      uptime: 120,
      db: 'up',
    };
  }

  async getUsageMetrics() {
    return {
      apiCallsLastHour: 10,
      apiErrorsLastHour: 2,
      lastProviderCallAt: '2026-02-12T00:00:00.000Z',
    };
  }
}

@Controller()
class ErrorTestController {
  @Get('boom')
  throwBadRequest() {
    throw new BadRequestException(['invalid_payload']);
  }
}

describe('Lot1 (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MonitoringController, ErrorTestController],
      providers: [
        AsyncContextService,
        JsonLogger,
        AllExceptionsFilter,
        {
          provide: MonitoringService,
          useClass: MonitoringServiceMock,
        },
      ],
    })
      .overrideProvider(MonitoringService)
      .useClass(MonitoringServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    const asyncContext = app.get(AsyncContextService);
    const logger = app.get(JsonLogger);
    const filter = app.get(AllExceptionsFilter);

    app.useLogger(logger);
    app.setGlobalPrefix('v1');
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

  it('GET /v1/health returns health payload', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      time: '2026-02-12T00:00:00.000Z',
      uptime: 120,
      db: 'up',
    });
    expect(response.headers['x-trace-id']).toBeDefined();
  });

  it('GET /v1/metrics/usage returns usage payload', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/metrics/usage')
      .expect(200);

    expect(response.body).toEqual({
      apiCallsLastHour: 10,
      apiErrorsLastHour: 2,
      lastProviderCallAt: '2026-02-12T00:00:00.000Z',
    });
    expect(response.headers['x-trace-id']).toBeDefined();
  });

  it('GET /v1/boom returns standardized error format', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/boom')
      .set('x-trace-id', 'trace-lot1')
      .expect(400);

    expect(response.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'Validation failed',
      details: ['invalid_payload'],
      traceId: 'trace-lot1',
    });
    expect(response.headers['x-trace-id']).toBe('trace-lot1');
  });
});
