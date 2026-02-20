import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeamFields20260220126000 implements MigrationInterface {
  name = 'AddTeamFields20260220126000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`teams\`
        ADD COLUMN \`code\` varchar(20) NULL AFTER \`name\`,
        ADD COLUMN \`national\` tinyint NULL AFTER \`founded\`,
        ADD COLUMN \`venueId\` int NULL AFTER \`badge\`,
        ADD COLUMN \`venueName\` varchar(160) NULL AFTER \`venueId\`,
        ADD COLUMN \`venueAddress\` varchar(160) NULL AFTER \`venueName\`,
        ADD COLUMN \`venueCity\` varchar(120) NULL AFTER \`venueAddress\`,
        ADD COLUMN \`venueCapacity\` int NULL AFTER \`venueCity\`,
        ADD COLUMN \`venueSurface\` varchar(40) NULL AFTER \`venueCapacity\`,
        ADD COLUMN \`venueImage\` varchar(255) NULL AFTER \`venueSurface\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`teams\`
        DROP COLUMN \`venueImage\`,
        DROP COLUMN \`venueSurface\`,
        DROP COLUMN \`venueCapacity\`,
        DROP COLUMN \`venueCity\`,
        DROP COLUMN \`venueAddress\`,
        DROP COLUMN \`venueName\`,
        DROP COLUMN \`venueId\`,
        DROP COLUMN \`national\`,
        DROP COLUMN \`code\`;
    `);
  }
}
