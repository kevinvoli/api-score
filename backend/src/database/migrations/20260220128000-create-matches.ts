import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMatches20260220128000 implements MigrationInterface {
  name = 'CreateMatches20260220128000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`matches\` (
        \`id\` char(36) NOT NULL,
        \`fixtureId\` int NOT NULL,
        \`leagueId\` int NULL,
        \`leagueName\` varchar(200) NULL,
        \`homeName\` varchar(120) NULL,
        \`awayName\` varchar(120) NULL,
        \`eventDate\` datetime NULL,
        \`status\` varchar(100) NULL,
        \`round\` varchar(80) NULL,
        \`raw\` json NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_matches_fixture_id\` (\`fixtureId\`),
        KEY \`idx_matches_league_id\` (\`leagueId\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `matches`;');
  }
}
