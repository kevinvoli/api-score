import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FixturesIngestionService } from '../fixtures/fixtures-ingestion.service';

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const fixturesIngestionService = app.get(FixturesIngestionService);
    await fixturesIngestionService.syncLiveFixtures();
    process.stdout.write('Seed fixtures completed using live provider data.\n');
  } finally {
    await app.close();
  }
}

seed().catch((error) => {
  process.stderr.write(`Seed fixtures failed: ${String(error)}\n`);
  process.exit(1);
});
