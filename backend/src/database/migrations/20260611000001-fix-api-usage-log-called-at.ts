import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixApiUsageLogCalledAt20260611000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`api_usage_logs\` MODIFY \`calledAt\` datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`api_usage_logs\` MODIFY \`calledAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
  }
}
