import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnrichExecutableOdds20261002100000 implements MigrationInterface {
  name = 'EnrichExecutableOdds20261002100000';

  // datetime(3) : une precision a la seconde arrondit (12:00:00.400 -> 12:00:00) et rendrait
  // selectionnable a T une cote recue apres T.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`odds_snapshots\`
        ADD COLUMN \`provider_key\` varchar(40) NULL,
        ADD COLUMN \`bookmaker_key\` varchar(160) NULL,
        ADD COLUMN \`market_key\` varchar(80) NULL,
        ADD COLUMN \`selection_key\` varchar(80) NULL,
        ADD COLUMN \`observed_at\` datetime(3) NULL,
        ADD COLUMN \`received_at\` datetime(3) NULL,
        ADD COLUMN \`available\` tinyint(1) NULL,
        ADD CONSTRAINT \`chk_odds_snapshots_observation_order\`
          CHECK (\`observed_at\` IS NULL OR \`received_at\` IS NULL OR \`observed_at\` <= \`received_at\`),
        ADD CONSTRAINT \`chk_odds_snapshots_available\`
          CHECK (\`available\` IS NULL OR \`available\` IN (0, 1)),
        ADD INDEX \`idx_odds_snapshots_executable_lookup\`
          (\`providerFixtureId\`, \`received_at\`);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`odds_snapshots\`
        DROP INDEX \`idx_odds_snapshots_executable_lookup\`,
        DROP CHECK \`chk_odds_snapshots_available\`,
        DROP CHECK \`chk_odds_snapshots_observation_order\`,
        DROP COLUMN \`available\`,
        DROP COLUMN \`received_at\`,
        DROP COLUMN \`observed_at\`,
        DROP COLUMN \`selection_key\`,
        DROP COLUMN \`market_key\`,
        DROP COLUMN \`bookmaker_key\`,
        DROP COLUMN \`provider_key\`;
    `);
  }
}
