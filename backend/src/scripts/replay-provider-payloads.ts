import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProviderPersistenceService } from '../fixtures/provider-persistence.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const persistence = app.get(ProviderPersistenceService);
    await persistence.replayFromPayloads();
    process.stdout.write('Provider payload replay completed.\n');
  } catch (error) {
    process.stderr.write(
      `Provider payload replay failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

run();
