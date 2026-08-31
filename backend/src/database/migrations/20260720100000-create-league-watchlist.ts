import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeagueWatchlist20260720100000 implements MigrationInterface {
  name = 'CreateLeagueWatchlist20260720100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`league_watchlist\` (
        \`id\` char(36) NOT NULL,
        \`leagueId\` int NOT NULL,
        \`leagueName\` varchar(160) NOT NULL,
        \`countryName\` varchar(120) NULL,
        \`isActive\` tinyint(1) NOT NULL DEFAULT 1,
        \`priority\` int NOT NULL DEFAULT 0,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_league_watchlist_league_id\` (\`leagueId\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `league_watchlist`;');
  }
}
