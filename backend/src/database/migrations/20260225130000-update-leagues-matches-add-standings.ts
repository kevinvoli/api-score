import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateLeaguesMatchesAddStandings20260225130000
  implements MigrationInterface
{
  name = 'UpdateLeaguesMatchesAddStandings20260225130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── leagues: add logo, countryName, change season to varchar ──
    await queryRunner.query(`
      ALTER TABLE \`leagues\`
        MODIFY COLUMN \`season\` varchar(20) NULL,
        ADD COLUMN \`logo\` varchar(255) NULL,
        ADD COLUMN \`countryName\` varchar(120) NULL;
    `);

    // ── matches: add new columns ──
    await queryRunner.query(`
      ALTER TABLE \`matches\`
        ADD COLUMN \`leagueLogo\` varchar(255) NULL,
        ADD COLUMN \`countryId\` int NULL,
        ADD COLUMN \`countryName\` varchar(120) NULL,
        ADD COLUMN \`countryLogo\` varchar(255) NULL,
        ADD COLUMN \`homeTeamId\` int NULL,
        ADD COLUMN \`homeTeamBadge\` varchar(255) NULL,
        ADD COLUMN \`homeFormation\` varchar(20) NULL,
        ADD COLUMN \`awayTeamId\` int NULL,
        ADD COLUMN \`awayTeamBadge\` varchar(255) NULL,
        ADD COLUMN \`awayFormation\` varchar(20) NULL,
        ADD COLUMN \`matchDate\` varchar(20) NULL,
        ADD COLUMN \`matchTime\` varchar(10) NULL,
        ADD COLUMN \`scoreHome\` varchar(10) NULL,
        ADD COLUMN \`scoreAway\` varchar(10) NULL,
        ADD COLUMN \`halfTimeScoreHome\` varchar(10) NULL,
        ADD COLUMN \`halfTimeScoreAway\` varchar(10) NULL,
        ADD COLUMN \`extraTimeScoreHome\` varchar(10) NULL,
        ADD COLUMN \`extraTimeScoreAway\` varchar(10) NULL,
        ADD COLUMN \`penaltyScoreHome\` varchar(10) NULL,
        ADD COLUMN \`penaltyScoreAway\` varchar(10) NULL,
        ADD COLUMN \`ftScoreHome\` varchar(10) NULL,
        ADD COLUMN \`ftScoreAway\` varchar(10) NULL,
        ADD COLUMN \`isLive\` tinyint NOT NULL DEFAULT 0,
        ADD COLUMN \`stageId\` varchar(40) NULL,
        ADD COLUMN \`stageName\` varchar(120) NULL,
        ADD COLUMN \`stadium\` varchar(200) NULL,
        ADD COLUMN \`referee\` varchar(120) NULL;
    `);

    // ── standings: new table ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`standings\` (
        \`id\` char(36) NOT NULL,
        \`leagueId\` int NOT NULL,
        \`season\` varchar(20) NULL,
        \`teamKey\` int NOT NULL,
        \`teamName\` varchar(120) NOT NULL,
        \`teamBadge\` varchar(255) NULL,
        \`standingPlace\` int NOT NULL DEFAULT 0,
        \`standingPlaceType\` varchar(100) NULL,
        \`played\` int NOT NULL DEFAULT 0,
        \`won\` int NOT NULL DEFAULT 0,
        \`drawn\` int NOT NULL DEFAULT 0,
        \`lost\` int NOT NULL DEFAULT 0,
        \`goalsFor\` int NOT NULL DEFAULT 0,
        \`goalsAgainst\` int NOT NULL DEFAULT 0,
        \`goalDiff\` int NOT NULL DEFAULT 0,
        \`points\` int NOT NULL DEFAULT 0,
        \`homeWon\` int NULL,
        \`homeDrawn\` int NULL,
        \`homeLost\` int NULL,
        \`homeGF\` int NULL,
        \`homeGA\` int NULL,
        \`homePoints\` int NULL,
        \`awayWon\` int NULL,
        \`awayDrawn\` int NULL,
        \`awayLost\` int NULL,
        \`awayGF\` int NULL,
        \`awayGA\` int NULL,
        \`awayPoints\` int NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_standings_league_team\` (\`leagueId\`, \`teamKey\`),
        KEY \`idx_standings_league_id\` (\`leagueId\`)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `standings`;');

    await queryRunner.query(`
      ALTER TABLE \`matches\`
        DROP COLUMN \`leagueLogo\`,
        DROP COLUMN \`countryId\`,
        DROP COLUMN \`countryName\`,
        DROP COLUMN \`countryLogo\`,
        DROP COLUMN \`homeTeamId\`,
        DROP COLUMN \`homeTeamBadge\`,
        DROP COLUMN \`homeFormation\`,
        DROP COLUMN \`awayTeamId\`,
        DROP COLUMN \`awayTeamBadge\`,
        DROP COLUMN \`awayFormation\`,
        DROP COLUMN \`matchDate\`,
        DROP COLUMN \`matchTime\`,
        DROP COLUMN \`scoreHome\`,
        DROP COLUMN \`scoreAway\`,
        DROP COLUMN \`halfTimeScoreHome\`,
        DROP COLUMN \`halfTimeScoreAway\`,
        DROP COLUMN \`extraTimeScoreHome\`,
        DROP COLUMN \`extraTimeScoreAway\`,
        DROP COLUMN \`penaltyScoreHome\`,
        DROP COLUMN \`penaltyScoreAway\`,
        DROP COLUMN \`ftScoreHome\`,
        DROP COLUMN \`ftScoreAway\`,
        DROP COLUMN \`isLive\`,
        DROP COLUMN \`stageId\`,
        DROP COLUMN \`stageName\`,
        DROP COLUMN \`stadium\`,
        DROP COLUMN \`referee\`;
    `);

    await queryRunner.query(`
      ALTER TABLE \`leagues\`
        DROP COLUMN \`logo\`,
        DROP COLUMN \`countryName\`,
        MODIFY COLUMN \`season\` int NULL;
    `);
  }
}
