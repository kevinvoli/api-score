import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBaseRates20260729120000 implements MigrationInterface {
  name = 'CreateBaseRates20260729120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`base_rates\` (
        \`id\` char(36) NOT NULL,
        \`leagueId\` int NOT NULL,
        \`season\` int NOT NULL,
        \`market\` varchar(40) NOT NULL,
        \`signal_type\` varchar(40) NOT NULL,
        \`threshold\` int NOT NULL,
        \`sampleSize\` int NOT NULL,
        \`observedRate\` decimal(6,4) NOT NULL,
        \`calculatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_base_rates_key\` (\`leagueId\`, \`season\`, \`market\`, \`signal_type\`, \`threshold\`),
        KEY \`idx_base_rates_league_season\` (\`leagueId\`, \`season\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `base_rates`;');
  }
}
