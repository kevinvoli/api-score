import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeams20260220124000 implements MigrationInterface {
  name = 'CreateTeams20260220124000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`teams\` (
        \`id\` char(36) NOT NULL,
        \`teamKey\` int NOT NULL,
        \`name\` varchar(120) NOT NULL,
        \`code\` varchar(20) NULL,
        \`country\` varchar(80) NULL,
        \`founded\` int NULL,
        \`national\` tinyint NULL,
        \`badge\` varchar(255) NULL,
        \`venueId\` int NULL,
        \`venueName\` varchar(160) NULL,
        \`venueAddress\` varchar(160) NULL,
        \`venueCity\` varchar(120) NULL,
        \`venueCapacity\` int NULL,
        \`venueSurface\` varchar(40) NULL,
        \`venueImage\` varchar(255) NULL,
        \`venue\` json NULL,
        \`leagueId\` int NULL,
        \`raw\` json NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_teams_team_key\` (\`teamKey\`),
        KEY \`idx_teams_league_id\` (\`leagueId\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `teams`;');
  }
}
