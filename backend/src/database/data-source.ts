import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

const dbUrl = process.env.DB_URL;
if (!dbUrl) {
  throw new Error(
    'DB_URL is missing. Create a .env file (or set DB_URL in environment) before running TypeORM migrations.',
  );
}

export default new DataSource({
  type: 'mysql',
  url: dbUrl,
  entities: ALL_ENTITIES,
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});
