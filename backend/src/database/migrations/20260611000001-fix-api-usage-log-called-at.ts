import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixApiUsageLogCalledAt20260611000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`api_usage_logs\` MODIFY \`called_at\` datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`api_usage_logs\` MODIFY \`called_at\` datetime NOT NULL`,
    );
  }
}
