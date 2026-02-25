import { MigrationInterface, QueryFailedError, QueryRunner } from 'typeorm';

export class AddTeamFields20260220126000 implements MigrationInterface {
  name = 'AddTeamFields20260220126000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'teams';
    await this.addColumn(queryRunner, table, 'code', 'ALTER TABLE `teams` ADD COLUMN `code` varchar(20) NULL AFTER `name`;');
    await this.addColumn(queryRunner, table, 'national', 'ALTER TABLE `teams` ADD COLUMN `national` tinyint NULL AFTER `founded`;');
    await this.addColumn(queryRunner, table, 'venueId', 'ALTER TABLE `teams` ADD COLUMN `venueId` int NULL AFTER `badge`;');
    await this.addColumn(
      queryRunner,
      table,
      'venueName',
      'ALTER TABLE `teams` ADD COLUMN `venueName` varchar(160) NULL AFTER `venueId`;',
    );
    await this.addColumn(
      queryRunner,
      table,
      'venueAddress',
      'ALTER TABLE `teams` ADD COLUMN `venueAddress` varchar(160) NULL AFTER `venueName`;',
    );
    await this.addColumn(
      queryRunner,
      table,
      'venueCity',
      'ALTER TABLE `teams` ADD COLUMN `venueCity` varchar(120) NULL AFTER `venueAddress`;',
    );
    await this.addColumn(
      queryRunner,
      table,
      'venueCapacity',
      'ALTER TABLE `teams` ADD COLUMN `venueCapacity` int NULL AFTER `venueCity`;',
    );
    await this.addColumn(
      queryRunner,
      table,
      'venueSurface',
      'ALTER TABLE `teams` ADD COLUMN `venueSurface` varchar(40) NULL AFTER `venueCapacity`;',
    );
    await this.addColumn(
      queryRunner,
      table,
      'venueImage',
      'ALTER TABLE `teams` ADD COLUMN `venueImage` varchar(255) NULL AFTER `venueSurface`;',
    );
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

  private async addColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    sql: string,
  ): Promise<void> {
    const exists = await queryRunner.hasColumn(table, column);
    if (exists) {
      return;
    }
    try {
      await queryRunner.query(sql);
    } catch (error) {
      if (this.isDuplicateColumnError(error)) {
        return;
      }
      throw error;
    }
  }

  private isDuplicateColumnError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = (error as QueryFailedError).driverError as { code?: string };
    return driverError?.code === 'ER_DUP_FIELDNAME';
  }
}
