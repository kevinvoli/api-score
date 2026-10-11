import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is missing. Create a .env file (or set ${name} in environment) before running TypeORM migrations.`,
    );
  }
  return value;
}

function requireMysqlPort(): number {
  const rawPort = requireEnvironmentVariable('MYSQL_PORT');
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

export default new DataSource({
  type: 'mysql',
  host: requireEnvironmentVariable('MYSQL_HOST'),
  port: requireMysqlPort(),
  username: requireEnvironmentVariable('MYSQL_USER'),
  password: process.env.MYSQL_PASSWORD || undefined,
  database: requireEnvironmentVariable('MYSQL_DATABASE'),
  entities: ALL_ENTITIES,
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});
