import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JsonLogger } from './common/json.logger';

const parseOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

/**
 * `CORS_ORIGIN` (liste separee par des virgules) prime, puis `FRONTEND_URL` (origine unique),
 * sinon on reflete l'origine appelante (dev). `*` est traduit en `true` : avec `credentials: true`
 * le navigateur refuse `Access-Control-Allow-Origin: *`, et un tableau `['*']` ne matche aucune
 * origine reelle (aucun en-tete CORS renvoye => erreur CORS cote navigateur).
 */
const resolveCorsOrigins = (): string[] | boolean => {
  const fromList = parseOrigins(process.env.CORS_ORIGIN ?? '');
  const origins =
    fromList.length > 0
      ? fromList
      : parseOrigins(process.env.FRONTEND_URL ?? '');

  if (origins.length === 0 || origins.includes('*')) return true;
  return origins;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = app.get(JsonLogger);
  const allExceptionsFilter = app.get(AllExceptionsFilter);
  const port = configService.get<number>('PORT', 3010);
  const corsEnabled = configService.get<string>('CORS_ENABLED') === 'true';

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
      origin: resolveCorsOrigins(),
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders:
        'Content-Type, Accept, Authorization, X-API-Key, X-CSRF-Token, X-Trace-Id',
      credentials: true,
    });
  }

  app.useGlobalFilters(allExceptionsFilter);
  await app.listen(port);
}

bootstrap();
