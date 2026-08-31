import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBacktestTables20260719140000 implements MigrationInterface {
  name = 'CreateBacktestTables20260719140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`backtest_runs\` (
        \`id\` char(36) NOT NULL,
        \`name\` varchar(120) NOT NULL,
        \`strategy\` json NOT NULL,
        \`windowStart\` datetime NOT NULL,
        \`windowEnd\` datetime NOT NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'PENDING',
        \`kpis\` json NULL,
        \`totalBets\` int NOT NULL DEFAULT 0,
        \`wonBets\` int NOT NULL DEFAULT 0,
        \`lostBets\` int NOT NULL DEFAULT 0,
        \`noResultBets\` int NOT NULL DEFAULT 0,
        \`error\` varchar(500) NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`completedAt\` datetime NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_backtest_runs_status\` (\`status\`),
        KEY \`idx_backtest_runs_created_at\` (\`createdAt\`)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`bet_results\` (
        \`id\` char(36) NOT NULL,
        \`runId\` char(36) NOT NULL,
        \`fixtureId\` char(36) NOT NULL,
        \`providerFixtureId\` bigint NOT NULL,
        \`marketType\` varchar(80) NOT NULL,
        \`selection\` varchar(255) NOT NULL,
        \`ruleName\` varchar(80) NULL,
        \`teamId\` int NULL,
        \`isHomeTeam\` tinyint(1) NOT NULL DEFAULT 0,
        \`decisionAt\` datetime NOT NULL,
        \`elapsedAtDecision\` int NULL,
        \`oddAtDecision\` decimal(8,3) NOT NULL,
        \`oddSource\` varchar(20) NOT NULL,
        \`edgePct\` decimal(5,2) NULL,
        \`confidenceScore\` int NULL,
        \`stake\` decimal(10,2) NOT NULL,
        \`outcome\` varchar(12) NOT NULL,
        \`profit\` decimal(12,3) NOT NULL DEFAULT 0,
        \`resolvedAt\` datetime NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_bet_results_run_id\` (\`runId\`),
        KEY \`idx_bet_results_outcome\` (\`outcome\`),
        KEY \`idx_bet_results_run_market\` (\`runId\`, \`marketType\`),
        CONSTRAINT \`fk_bet_results_run_id\` FOREIGN KEY (\`runId\`)
          REFERENCES \`backtest_runs\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `bet_results`;');
    await queryRunner.query('DROP TABLE IF EXISTS `backtest_runs`;');
  }
}
