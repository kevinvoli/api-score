import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOddsSnapshots20260719000000 implements MigrationInterface {
  name = 'CreateOddsSnapshots20260719000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`odds_snapshots\` (
        \`id\` char(36) NOT NULL,
        \`fixtureId\` char(36) NOT NULL,
        \`providerFixtureId\` bigint NOT NULL,
        \`bookmakerId\` int NOT NULL,
        \`bookmakerName\` varchar(120) NOT NULL,
        \`marketType\` varchar(60) NOT NULL,
        \`outcome\` varchar(40) NOT NULL,
        \`oddValue\` decimal(8,3) NOT NULL,
        \`impliedProbabilityRaw\` decimal(7,6) NOT NULL,
        \`impliedProbabilityFair\` decimal(7,6) NOT NULL,
        \`overround\` decimal(7,6) NOT NULL,
        \`phase\` varchar(10) NOT NULL,
        \`capturedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_odds_snapshots_fixture_id\` (\`fixtureId\`),
        KEY \`idx_odds_snapshots_captured_at\` (\`capturedAt\`),
        KEY \`idx_odds_snapshots_fixture_market_captured\` (\`fixtureId\`, \`marketType\`, \`capturedAt\`),
        CONSTRAINT \`fk_odds_snapshots_fixture_id\` FOREIGN KEY (\`fixtureId\`)
          REFERENCES \`fixtures\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `odds_snapshots`;');
  }
}
