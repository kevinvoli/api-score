import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ApiUsageLog } from './entities/api-usage-log.entity';
import { AppRuntimeState } from './entities/app-runtime-state.entity';
import { FixtureEvent } from './entities/fixture-event.entity';
import { FixtureLineup } from './entities/fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from './entities/fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from './entities/fixture-stats-snapshot.entity';
import { Fixture } from './entities/fixture.entity';

const dbUrl = process.env.DB_URL;
if (!dbUrl) {
  throw new Error(
    'DB_URL is missing. Create a .env file (or set DB_URL in environment) before running TypeORM migrations.',
  );
}

export default new DataSource({
  type: 'mysql',
  url: dbUrl,
  entities: [
    ApiUsageLog,
    AppRuntimeState,
    Fixture,
    FixtureEvent,
    FixtureLineup,
    FixturePlayerStatsSnapshot,
    FixtureStatsSnapshot,
  ],
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});
