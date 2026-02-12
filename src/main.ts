import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JsonLogger } from './common/json.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = app.get(JsonLogger);
  const allExceptionsFilter = app.get(AllExceptionsFilter);
  const port = configService.get<number>('PORT', 3010);
  const corsEnabled = configService.get<string>('CORS_ENABLED') === 'true';
  const corsOrigin = configService.get<string>('CORS_ORIGIN') ?? '*';

  app.useLogger(logger);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (corsEnabled) {
    app.enableCors({
      origin: corsOrigin === '*' ? true : corsOrigin,
    });
  }

  app.useGlobalFilters(allExceptionsFilter);
  await app.listen(port);
}

bootstrap();
