import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSmartCoupons20260306100000 implements MigrationInterface {
  name = 'CreateSmartCoupons20260306100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`smart_coupons\` (
        \`id\`                   VARCHAR(36)     NOT NULL DEFAULT (UUID()),
        \`fixtureId\`            VARCHAR(36)     NOT NULL,
        \`homeTeamName\`         VARCHAR(120)    NULL,
        \`awayTeamName\`         VARCHAR(120)    NULL,
        \`teamId\`               INT             NULL,
        \`teamName\`             VARCHAR(120)    NULL,
        \`isHomeTeam\`           TINYINT(1)      NOT NULL DEFAULT 0,
        \`marketType\`           VARCHAR(80)     NOT NULL,
        \`selection\`            VARCHAR(255)    NOT NULL,
        \`currentOdd\`           DECIMAL(6,2)    NULL,
        \`minAcceptableOdd\`     DECIMAL(6,2)    NULL,
        \`edgePct\`              DECIMAL(5,2)    NULL,
        \`confidenceScore\`      INT             NULL,
        \`reasons\`              JSON            NULL,
        \`ruleName\`             VARCHAR(80)     NULL,
        \`elapsedAtSuggestion\`  INT             NULL,
        \`shotsCount\`           INT             NULL,
        \`status\`               VARCHAR(10)     NOT NULL DEFAULT 'PENDING',
        \`resolvedAt\`           DATETIME        NULL,
        \`createdAt\`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_smart_coupons_fixture_team_market\` (\`fixtureId\`, \`teamId\`, \`marketType\`),
        INDEX \`idx_smart_coupons_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `smart_coupons`');
  }
}
