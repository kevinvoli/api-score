import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

async function checkDbConnection(): Promise<void> {
  const dbUrl = process.env.DB_URL;

  if (!dbUrl) {
    console.error(
      '[check-db-connection] ERROR: DB_URL is not set. ' +
        'Create a .env file or export DB_URL before running this script.',
    );
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'mysql',
    url: dbUrl,
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
