import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFixtureAnalytics20260220122000 implements MigrationInterface {
  name = 'CreateFixtureAnalytics20260220122000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`fixture_analytics\` (
        \`id\` char(36) NOT NULL,
        \`fixtureId\` char(36) NOT NULL,
        \`metrics\` json NOT NULL,
        \`computedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_fixture_analytics_fixture_id\` (\`fixtureId\`),
        KEY \`idx_fixture_analytics_computed_at\` (\`computedAt\`),
        CONSTRAINT \`fk_fixture_analytics_fixture_id\` FOREIGN KEY (\`fixtureId\`)
          REFERENCES \`fixtures\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `fixture_analytics`;');
  }
}
