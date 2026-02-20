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
import { RecommendationsModule } from './recommendations/recommendations.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ArchiveModule } from './archive/archive.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    CommonModule,
    DatabaseModule,
    FixturesModule,
    MatchModule,
    MonitoringModule,
    RecommendationsModule,
    MaintenanceModule,
    ArchiveModule,
    AnalyticsModule,
    TeamsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware, RequestLoggingMiddleware).forRoutes('*');
  }
}
