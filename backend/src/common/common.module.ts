import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from '../database/entities/api-usage-log.entity';
import { AsyncContextService } from './async-context.service';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { JsonLogger } from './json.logger';
import { RateBudgetService } from './services/rate-budget.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ApiUsageLog])],
  providers: [
    AsyncContextService,
    JsonLogger,
    AllExceptionsFilter,
    RateBudgetService,
  ],
  exports: [
    AsyncContextService,
    JsonLogger,
    AllExceptionsFilter,
    RateBudgetService,
  ],
})
export class CommonModule {}
