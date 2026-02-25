import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ApiUsageLog } from './entities/api-usage-log.entity';
import { ApiFootballPayload } from './entities/api-football-payload.entity';
import { AppRuntimeState } from './entities/app-runtime-state.entity';
import { FixtureAnalytics } from './entities/fixture-analytics.entity';
import { FixtureEvent } from './entities/fixture-event.entity';
import { FixtureLineup } from './entities/fixture-lineup.entity';
import { FixturePlayerStatsSnapshot } from './entities/fixture-player-stats-snapshot.entity';
import { FixtureStatsSnapshot } from './entities/fixture-stats-snapshot.entity';
import { Fixture } from './entities/fixture.entity';
import { BetRecommendation } from './entities/bet-recommendation.entity';
import { Team } from './entities/team.entity';
import { Country } from './entities/country.entity';
import { League } from './entities/league.entity';
import { Match } from './entities/match.entity';
import { Standing } from './entities/standing.entity';

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
    ApiFootballPayload,
    AppRuntimeState,
    FixtureAnalytics,
    BetRecommendation,
    Team,
    Fixture,
    FixtureEvent,
    FixtureLineup,
    FixturePlayerStatsSnapshot,
    FixtureStatsSnapshot,
    Country,
    League,
    Match,
    Standing,
  ],
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});
