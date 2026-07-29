import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LOT 2 : `confidenceScore` peut désormais être NULL (aucun taux de base réel)
 * et l'on trace la taille d'échantillon du taux qui l'a produit.
 */
export class BaseRateConfidence20260729130000 implements MigrationInterface {
  name = 'BaseRateConfidence20260729130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `bet_recommendations` MODIFY `confidenceScore` int NULL;',
    );
    await queryRunner.query(
      'ALTER TABLE `bet_recommendations` ADD `baseRateSampleSize` int NULL;',
    );
    await queryRunner.query(
      'ALTER TABLE `smart_coupons` ADD `baseRateSampleSize` int NULL;',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `smart_coupons` DROP COLUMN `baseRateSampleSize`;',
    );
    await queryRunner.query(
      'ALTER TABLE `bet_recommendations` DROP COLUMN `baseRateSampleSize`;',
    );
    await queryRunner.query(
      'ALTER TABLE `bet_recommendations` MODIFY `confidenceScore` int NOT NULL;',
    );
  }
}
