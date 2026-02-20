import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeamFields20260220126000 implements MigrationInterface {
  name = 'AddTeamFields20260220126000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'teams';
    const hasCode = await queryRunner.hasColumn(table, 'code');
    const hasNational = await queryRunner.hasColumn(table, 'national');
    const hasVenueId = await queryRunner.hasColumn(table, 'venueId');
    const hasVenueName = await queryRunner.hasColumn(table, 'venueName');
    const hasVenueAddress = await queryRunner.hasColumn(table, 'venueAddress');
    const hasVenueCity = await queryRunner.hasColumn(table, 'venueCity');
    const hasVenueCapacity = await queryRunner.hasColumn(table, 'venueCapacity');
    const hasVenueSurface = await queryRunner.hasColumn(table, 'venueSurface');
    const hasVenueImage = await queryRunner.hasColumn(table, 'venueImage');

    if (!hasCode) {
      await queryRunner.query('ALTER TABLE `teams` ADD COLUMN `code` varchar(20) NULL AFTER `name`;');
    }
    if (!hasNational) {
      await queryRunner.query('ALTER TABLE `teams` ADD COLUMN `national` tinyint NULL AFTER `founded`;');
    }
    if (!hasVenueId) {
      await queryRunner.query('ALTER TABLE `teams` ADD COLUMN `venueId` int NULL AFTER `badge`;');
    }
    if (!hasVenueName) {
      await queryRunner.query(
        'ALTER TABLE `teams` ADD COLUMN `venueName` varchar(160) NULL AFTER `venueId`;',
      );
    }
    if (!hasVenueAddress) {
      await queryRunner.query(
        'ALTER TABLE `teams` ADD COLUMN `venueAddress` varchar(160) NULL AFTER `venueName`;',
      );
    }
    if (!hasVenueCity) {
      await queryRunner.query(
        'ALTER TABLE `teams` ADD COLUMN `venueCity` varchar(120) NULL AFTER `venueAddress`;',
      );
    }
    if (!hasVenueCapacity) {
      await queryRunner.query(
        'ALTER TABLE `teams` ADD COLUMN `venueCapacity` int NULL AFTER `venueCity`;',
      );
    }
    if (!hasVenueSurface) {
      await queryRunner.query(
        'ALTER TABLE `teams` ADD COLUMN `venueSurface` varchar(40) NULL AFTER `venueCapacity`;',
      );
    }
    if (!hasVenueImage) {
      await queryRunner.query(
        'ALTER TABLE `teams` ADD COLUMN `venueImage` varchar(255) NULL AFTER `venueSurface`;',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'teams';
    const hasVenueImage = await queryRunner.hasColumn(table, 'venueImage');
    const hasVenueSurface = await queryRunner.hasColumn(table, 'venueSurface');
    const hasVenueCapacity = await queryRunner.hasColumn(table, 'venueCapacity');
    const hasVenueCity = await queryRunner.hasColumn(table, 'venueCity');
    const hasVenueAddress = await queryRunner.hasColumn(table, 'venueAddress');
    const hasVenueName = await queryRunner.hasColumn(table, 'venueName');
    const hasVenueId = await queryRunner.hasColumn(table, 'venueId');
    const hasNational = await queryRunner.hasColumn(table, 'national');
    const hasCode = await queryRunner.hasColumn(table, 'code');

    if (hasVenueImage) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `venueImage`;');
    }
    if (hasVenueSurface) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `venueSurface`;');
    }
    if (hasVenueCapacity) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `venueCapacity`;');
    }
    if (hasVenueCity) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `venueCity`;');
    }
    if (hasVenueAddress) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `venueAddress`;');
    }
    if (hasVenueName) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `venueName`;');
    }
    if (hasVenueId) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `venueId`;');
    }
    if (hasNational) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `national`;');
    }
    if (hasCode) {
      await queryRunner.query('ALTER TABLE `teams` DROP COLUMN `code`;');
    }
  }
}
