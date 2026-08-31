import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBetRecommendations20260220120000
  implements MigrationInterface
{
  name = 'CreateBetRecommendations20260220120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`bet_recommendations\` (
        \`id\` char(36) NOT NULL,
        \`fixtureId\` char(36) NOT NULL,
        \`marketType\` varchar(120) NOT NULL,
        \`selection\` varchar(160) NOT NULL,
        \`currentOdd\` decimal(8,3) NOT NULL,
        \`minAcceptableOdd\` decimal(8,3) NOT NULL,
        \`edgePct\` decimal(5,2) NOT NULL,
        \`confidenceScore\` int NOT NULL,
        \`reasons\` json NOT NULL,
        \`riskFlags\` json NOT NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'NEW',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_bet_recommendations_fixture_id\` (\`fixtureId\`),
        KEY \`idx_bet_recommendations_status\` (\`status\`),
        CONSTRAINT \`fk_bet_recommendations_fixture_id\` FOREIGN KEY (\`fixtureId\`)
          REFERENCES \`fixtures\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `bet_recommendations`;');
  }
}
