import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFixtureNames20260220123000 implements MigrationInterface {
  name = 'AddFixtureNames20260220123000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`fixtures\`
        ADD COLUMN \`homeTeamName\` varchar(120) NULL AFTER \`awayTeamId\`,
        ADD COLUMN \`awayTeamName\` varchar(120) NULL AFTER \`homeTeamName\`,
        ADD COLUMN \`leagueName\` varchar(120) NULL AFTER \`awayTeamName\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`fixtures\`
        DROP COLUMN \`leagueName\`,
        DROP COLUMN \`awayTeamName\`,
        DROP COLUMN \`homeTeamName\`;
    `);
  }
}
