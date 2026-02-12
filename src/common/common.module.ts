import { Global, Module } from '@nestjs/common';
import { AsyncContextService } from './async-context.service';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { JsonLogger } from './json.logger';

@Global()
@Module({
  providers: [AsyncContextService, JsonLogger, AllExceptionsFilter],
  exports: [AsyncContextService, JsonLogger, AllExceptionsFilter],
})
export class CommonModule {}
