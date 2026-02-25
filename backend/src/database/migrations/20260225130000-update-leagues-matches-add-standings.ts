import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateLeaguesMatchesAddStandings20260225130000 implements MigrationInterface {
  name = 'UpdateLeaguesMatchesAddStandings20260225130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── leagues: add logo, countryName, change season to varchar ──
    await queryRunner.query(`
      ALTER TABLE \`leagues\`
        MODIFY COLUMN \`season\` varchar(20) NULL,
        ADD COLUMN IF NOT EXISTS \`logo\` varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS \`countryName\` varchar(120) NULL;
    `);

    // ── matches: add new columns ──
    await queryRunner.query(`
      ALTER TABLE \`matches\`
        ADD COLUMN IF NOT EXISTS \`leagueLogo\` varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS \`countryId\` int NULL,
        ADD COLUMN IF NOT EXISTS \`countryName\` varchar(120) NULL,
        ADD COLUMN IF NOT EXISTS \`countryLogo\` varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS \`homeTeamId\` int NULL,
        ADD COLUMN IF NOT EXISTS \`homeTeamBadge\` varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS \`homeFormation\` varchar(20) NULL,
        ADD COLUMN IF NOT EXISTS \`awayTeamId\` int NULL,
        ADD COLUMN IF NOT EXISTS \`awayTeamBadge\` varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS \`awayFormation\` varchar(20) NULL,
        ADD COLUMN IF NOT EXISTS \`matchDate\` varchar(20) NULL,
        ADD COLUMN IF NOT EXISTS \`matchTime\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`scoreHome\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`scoreAway\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`halfTimeScoreHome\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`halfTimeScoreAway\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`extraTimeScoreHome\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`extraTimeScoreAway\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`penaltyScoreHome\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`penaltyScoreAway\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`ftScoreHome\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`ftScoreAway\` varchar(10) NULL,
        ADD COLUMN IF NOT EXISTS \`isLive\` tinyint NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS \`stageId\` varchar(40) NULL,
        ADD COLUMN IF NOT EXISTS \`stageName\` varchar(120) NULL,
        ADD COLUMN IF NOT EXISTS \`stadium\` varchar(200) NULL,
        ADD COLUMN IF NOT EXISTS \`referee\` varchar(120) NULL;
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
        DROP COLUMN IF EXISTS \`leagueLogo\`,
        DROP COLUMN IF EXISTS \`countryId\`,
        DROP COLUMN IF EXISTS \`countryName\`,
        DROP COLUMN IF EXISTS \`countryLogo\`,
        DROP COLUMN IF EXISTS \`homeTeamId\`,
        DROP COLUMN IF EXISTS \`homeTeamBadge\`,
        DROP COLUMN IF EXISTS \`homeFormation\`,
        DROP COLUMN IF EXISTS \`awayTeamId\`,
        DROP COLUMN IF EXISTS \`awayTeamBadge\`,
        DROP COLUMN IF EXISTS \`awayFormation\`,
        DROP COLUMN IF EXISTS \`matchDate\`,
        DROP COLUMN IF EXISTS \`matchTime\`,
        DROP COLUMN IF EXISTS \`scoreHome\`,
        DROP COLUMN IF EXISTS \`scoreAway\`,
        DROP COLUMN IF EXISTS \`halfTimeScoreHome\`,
        DROP COLUMN IF EXISTS \`halfTimeScoreAway\`,
        DROP COLUMN IF EXISTS \`extraTimeScoreHome\`,
        DROP COLUMN IF EXISTS \`extraTimeScoreAway\`,
        DROP COLUMN IF EXISTS \`penaltyScoreHome\`,
        DROP COLUMN IF EXISTS \`penaltyScoreAway\`,
        DROP COLUMN IF EXISTS \`ftScoreHome\`,
        DROP COLUMN IF EXISTS \`ftScoreAway\`,
        DROP COLUMN IF EXISTS \`isLive\`,
        DROP COLUMN IF EXISTS \`stageId\`,
        DROP COLUMN IF EXISTS \`stageName\`,
        DROP COLUMN IF EXISTS \`stadium\`,
        DROP COLUMN IF EXISTS \`referee\`;
    `);

    await queryRunner.query(`
      ALTER TABLE \`leagues\`
        DROP COLUMN IF EXISTS \`logo\`,
        DROP COLUMN IF EXISTS \`countryName\`,
        MODIFY COLUMN \`season\` int NULL;
    `);
  }
}
