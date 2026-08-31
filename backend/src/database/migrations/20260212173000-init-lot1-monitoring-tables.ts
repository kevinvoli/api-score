import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitLot1MonitoringTables20260212173000
  implements MigrationInterface
{
  name = 'InitLot1MonitoringTables20260212173000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \
      \`api_usage_logs\` (
        \`id\` char(36) NOT NULL,
        \`provider\` varchar(100) NOT NULL,
        \`endpoint\` varchar(255) NOT NULL,
        \`requestParams\` json NULL,
        \`responseStatus\` int NOT NULL,
        \`latencyMs\` int NOT NULL,
        \`rateLimitRemaining\` int NULL,
        \`calledAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_api_usage_logs_called_at\` (\`calledAt\`),
        KEY \`idx_api_usage_logs_endpoint\` (\`endpoint\`)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \
      \`app_runtime_state\` (
        \`id\` char(36) NOT NULL,
        \`key\` varchar(120) NOT NULL,
        \`value\` json NOT NULL,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_app_runtime_state_key\` (\`key\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `app_runtime_state`;');
    await queryRunner.query('DROP TABLE IF EXISTS `api_usage_logs`;');
  }
}
