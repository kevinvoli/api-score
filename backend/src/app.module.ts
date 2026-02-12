import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { TraceIdMiddleware } from './common/middleware/trace-id.middleware';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { FixturesModule } from './fixtures/fixtures.module';
import { MatchModule } from './match/match.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    CommonModule,
    DatabaseModule,
    FixturesModule,
    MatchModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
