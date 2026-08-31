import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiFootballPayloads20260220121000
  implements MigrationInterface
{
  name = 'CreateApiFootballPayloads20260220121000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`api_football_payloads\` (
        \`id\` char(36) NOT NULL,
        \`provider\` varchar(40) NOT NULL,
        \`endpoint\` varchar(80) NOT NULL,
        \`params\` json NOT NULL,
        \`payload\` json NOT NULL,
        \`matchId\` varchar(40) NULL,
        \`leagueId\` int NULL,
        \`teamId\` int NULL,
        \`fetchedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_api_football_payloads_endpoint\` (\`endpoint\`),
        KEY \`idx_api_football_payloads_match_id\` (\`matchId\`),
        KEY \`idx_api_football_payloads_league_id\` (\`leagueId\`),
        KEY \`idx_api_football_payloads_fetched_at\` (\`fetchedAt\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `api_football_payloads`;');
  }
}
