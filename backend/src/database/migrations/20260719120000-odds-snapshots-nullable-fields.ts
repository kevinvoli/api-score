import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * apifootball (contrairement à api-sports) ne fournit qu'un nom de bookmaker,
 * jamais d'id numérique, et certains marchés (ex. double chance) ne sont pas
 * des partitions d'issues exclusives : la notion de probabilité "fair" et
 * d'overround n'y a pas de sens. Ces 3 colonnes deviennent donc nullables.
 */
export class OddsSnapshotsNullableFields20260719120000
  implements MigrationInterface
{
  name = 'OddsSnapshotsNullableFields20260719120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`odds_snapshots\`
        MODIFY \`bookmakerId\` int NULL,
        MODIFY \`impliedProbabilityFair\` decimal(7,6) NULL,
        MODIFY \`overround\` decimal(7,6) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`odds_snapshots\`
        MODIFY \`bookmakerId\` int NOT NULL,
        MODIFY \`impliedProbabilityFair\` decimal(7,6) NOT NULL,
        MODIFY \`overround\` decimal(7,6) NOT NULL;
    `);
  }
}
