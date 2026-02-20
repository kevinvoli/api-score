import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFixtureBadges20260220125000 implements MigrationInterface {
  name = 'AddFixtureBadges20260220125000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`fixtures\`
        ADD COLUMN \`homeTeamBadge\` varchar(255) NULL AFTER \`awayTeamName\`,
        ADD COLUMN \`awayTeamBadge\` varchar(255) NULL AFTER \`homeTeamBadge\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`fixtures\`
        DROP COLUMN \`awayTeamBadge\`,
        DROP COLUMN \`homeTeamBadge\`;
    `);
  }
}
