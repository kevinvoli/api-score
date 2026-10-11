import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

async function checkDbConnection(): Promise<void> {
  const requiredVariables = [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_USER',
    'MYSQL_DATABASE',
  ] as const;
  const missingVariables = requiredVariables.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingVariables.length > 0) {
    console.error(
      `[check-db-connection] ERROR: missing environment variables: ${missingVariables.join(', ')}.`,
    );
    process.exit(1);
  }

  const port = Number(process.env.MYSQL_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(
      '[check-db-connection] ERROR: MYSQL_PORT must be an integer between 1 and 65535.',
    );
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.MYSQL_HOST,
    port,
    username: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || undefined,
    database: process.env.MYSQL_DATABASE,
    entities: [],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    await dataSource.query('SELECT 1');
    await dataSource.destroy();
    console.log('[check-db-connection] OK: database connection successful.');
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[check-db-connection] ERROR: ${message}`);
    process.exit(1);
  }
}

void checkDbConnection();
