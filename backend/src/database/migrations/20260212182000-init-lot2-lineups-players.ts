import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitLot2LineupsPlayers20260212182000
  implements MigrationInterface
{
  name = 'InitLot2LineupsPlayers20260212182000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \
      \`fixture_lineups\` (
        \`id\` char(36) NOT NULL,
        \`fixtureId\` char(36) NOT NULL,
        \`teamId\` int NULL,
        \`formation\` varchar(30) NULL,
        \`coach\` json NULL,
        \`startXi\` json NULL,
        \`substitutes\` json NULL,
        \`raw\` json NOT NULL,
        \`snapshotAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_fixture_lineups_fixture_id\` (\`fixtureId\`),
        CONSTRAINT \`fk_fixture_lineups_fixture_id\`
          FOREIGN KEY (\`fixtureId\`) REFERENCES \`fixtures\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \
      \`fixture_player_stats_snapshots\` (
        \`id\` char(36) NOT NULL,
        \`fixtureId\` char(36) NOT NULL,
        \`teamId\` int NULL,
        \`playerId\` int NULL,
        \`stats\` json NOT NULL,
        \`snapshotAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_fixture_player_stats_fixture_id\` (\`fixtureId\`),
        KEY \`idx_fixture_player_stats_snapshot_at\` (\`snapshotAt\`),
        CONSTRAINT \`fk_fixture_player_stats_fixture_id\`
          FOREIGN KEY (\`fixtureId\`) REFERENCES \`fixtures\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS `fixture_player_stats_snapshots`;',
    );
    await queryRunner.query('DROP TABLE IF EXISTS `fixture_lineups`;');
  }
}
