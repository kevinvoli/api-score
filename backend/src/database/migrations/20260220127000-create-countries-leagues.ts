import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCountriesLeagues20260220127000
  implements MigrationInterface
{
  name = 'CreateCountriesLeagues20260220127000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`countries\` (
        \`id\` char(36) NOT NULL,
        \`countryId\` int NOT NULL,
        \`name\` varchar(120) NOT NULL,
        \`logo\` varchar(255) NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_country_country_id\` (\`countryId\`)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`leagues\` (
        \`id\` char(36) NOT NULL,
        \`leagueId\` int NOT NULL,
        \`name\` varchar(200) NOT NULL,
        \`countryId\` int NULL,
        \`season\` int NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_league_league_id\` (\`leagueId\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `leagues`;');
    await queryRunner.query('DROP TABLE IF EXISTS `countries`;');
  }
}
