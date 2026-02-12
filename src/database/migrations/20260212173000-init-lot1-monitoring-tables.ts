import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitLot1MonitoringTables20260212173000 implements MigrationInterface {
  name = 'InitLot1MonitoringTables20260212173000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_usage_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider" varchar(100) NOT NULL,
        "endpoint" varchar(255) NOT NULL,
        "requestParams" jsonb,
        "responseStatus" integer NOT NULL,
        "latencyMs" integer NOT NULL,
        "rateLimitRemaining" integer,
        "calledAt" timestamptz NOT NULL DEFAULT now(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_api_usage_logs_called_at" ON "api_usage_logs" ("calledAt");',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_api_usage_logs_endpoint" ON "api_usage_logs" ("endpoint");',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_runtime_state" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" varchar(120) NOT NULL,
        "value" jsonb NOT NULL,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_app_runtime_state_key" UNIQUE ("key")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "app_runtime_state";');
    await queryRunner.query('DROP TABLE IF EXISTS "api_usage_logs";');
  }
}
