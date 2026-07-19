import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitLot2FixturesIngestion20260212174000
  implements MigrationInterface
{
  name = 'InitLot2FixturesIngestion20260212174000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \
      \`fixtures\` (
        \`id\` char(36) NOT NULL,
        \`providerFixtureId\` bigint NOT NULL,
        \`leagueId\` int NULL,
        \`season\` int NULL,
        \`homeTeamId\` int NULL,
        \`awayTeamId\` int NULL,
        \`statusShort\` varchar(20) NULL,
        \`statusLong\` varchar(120) NULL,
        \`elapsed\` int NULL,
        \`matchDate\` datetime NULL,
        \`scoreHome\` int NULL,
        \`scoreAway\` int NULL,
        \`raw\` json NOT NULL,
        \`lastSyncedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_fixtures_provider_fixture_id\` (\`providerFixtureId\`),
        KEY \`idx_fixtures_last_synced_at\` (\`lastSyncedAt\`)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \
      \`fixture_events\` (
        \`id\` char(36) NOT NULL,
        \`fixtureId\` char(36) NOT NULL,
        \`teamId\` int NULL,
        \`playerId\` int NULL,
        \`assistPlayerId\` int NULL,
        \`minute\` int NULL,
        \`extra\` int NULL,
        \`eventType\` varchar(60) NULL,
        \`detail\` varchar(120) NULL,
        \`raw\` json NOT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_fixture_events_fixture_id\` (\`fixtureId\`),
        CONSTRAINT \`fk_fixture_events_fixture_id\` FOREIGN KEY (\`fixtureId\`)
          REFERENCES \`fixtures\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \
      \`fixture_stats_snapshots\` (
        \`id\` char(36) NOT NULL,
        \`fixtureId\` char(36) NOT NULL,
        \`teamId\` int NULL,
        \`half\` varchar(20) NULL,
        \`elapsed\` int NULL,
        \`stats\` json NOT NULL,
        \`snapshotAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_fixture_stats_snapshot_fixture_id\` (\`fixtureId\`),
        KEY \`idx_fixture_stats_snapshot_snapshot_at\` (\`snapshotAt\`),
        CONSTRAINT \`fk_fixture_stats_fixture_id\` FOREIGN KEY (\`fixtureId\`)
          REFERENCES \`fixtures\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `fixture_stats_snapshots`;');
    await queryRunner.query('DROP TABLE IF EXISTS `fixture_events`;');
    await queryRunner.query('DROP TABLE IF EXISTS `fixtures`;');
  }
}
