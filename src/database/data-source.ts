import { DataSource } from 'typeorm';
import { ApiUsageLog } from './entities/api-usage-log.entity';
import { AppRuntimeState } from './entities/app-runtime-state.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DB_URL,
  entities: [ApiUsageLog, AppRuntimeState],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
