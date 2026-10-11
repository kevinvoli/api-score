import { INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isEmail } from 'class-validator';
import { CommonModule } from '../common/common.module';
import { AppConfigModule } from '../config/app-config.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { normalizeAuthEmail } from '../auth/auth-email';

/**
 * Contexte réduit à la persistance et à l'authentification : évite de
 * démarrer AppModule, dont ScheduleModule.forRoot() enregistrerait les
 * crons applicatifs (ex. smart-suggestions) pour la seule durée de cette
 * CLI.
 */
@Module({
  imports: [AppConfigModule, CommonModule, DatabaseModule, AuthModule],
})
class CreateAdminModule {}

function readCredentials(): { email: string; password: string } {
  const emailInput = process.env.CREATE_ADMIN_EMAIL;
  const email = emailInput ? normalizeAuthEmail(emailInput) : undefined;
  const password = process.env.CREATE_ADMIN_PASSWORD;

  if (!email || !isEmail(email)) {
    throw new Error('CREATE_ADMIN_EMAIL must be a valid email address');
  }
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error(
      'CREATE_ADMIN_PASSWORD must contain between 12 and 128 characters',
    );
  }

  return { email, password };
}

async function main(): Promise<void> {
  const credentials = readCredentials();
  let app: INestApplicationContext | undefined;

  try {
    app = await NestFactory.createApplicationContext(CreateAdminModule, {
      logger: false,
    });
    const user = await app
      .get(AuthService)
      .createInitialAdmin(credentials.email, credentials.password);
    process.stdout.write(`Administrator created: ${user.email}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Administrator creation failed: ${message}\n`);
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

void main();
