import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import { toNumber } from '../common/utils/stats.utils';
import { Fixture } from '../database/entities/fixture.entity';
import { OddsSnapshot } from '../database/entities/odds-snapshot.entity';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import {
  isPartitionMarket,
  mapApifootballOddsEntry,
} from './apifootball-odds.mapper';
import { impliedProbability, removeMargin } from './odds-math';

type Phase = 'PREMATCH' | 'LIVE';

// La sélection filtre sur les statuts NORMALISÉS : quel que soit le provider,
// normalizeApifootballStatus (fixtures-ingestion) écrit en base le vocabulaire
// api-sports ('' → NS, minute/'45+'/'90+' → LIVE, 'Half Time' → HT,
// 'Finished' → FT). Ne jamais filtrer ici sur les libellés bruts apifootball.
const PREMATCH_STATUS = 'NS';
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'BT'];

interface OddsOutcome {
  outcome: string;
  oddValue: number;
}

@Injectable()
export class OddsIngestionService {
  constructor(
    private readonly apiFootballClient: ApiFootballClient,
    private readonly logger: JsonLogger,
    @InjectRepository(Fixture)
    private readonly fixtureRepository: Repository<Fixture>,
    @InjectRepository(OddsSnapshot)
    private readonly oddsSnapshotRepository: Repository<OddsSnapshot>,
  ) {}

  async syncPrematchOdds(): Promise<{
    fixturesProcessed: number;
    snapshotsInserted: number;
  }> {
    const fixtures = await this.getUpcomingFixtures();
    return this.syncOddsForFixtures(fixtures, 'PREMATCH');
  }

  async syncLiveOdds(): Promise<{
    fixturesProcessed: number;
    snapshotsInserted: number;
  }> {
    const fixtures = await this.getLiveFixtures();
    return this.syncOddsForFixtures(fixtures, 'LIVE');
  }

  private async getUpcomingFixtures(): Promise<Fixture[]> {
    return this.fixtureRepository
      .createQueryBuilder('fixture')
      .where('fixture.statusShort = :status', { status: PREMATCH_STATUS })
      .orderBy('fixture.matchDate', 'ASC')
      .take(50)
      .getMany();
  }

  private async getLiveFixtures(): Promise<Fixture[]> {
    return this.fixtureRepository
      .createQueryBuilder('fixture')
      .where('fixture.statusShort IN (:...statuses)', {
        statuses: LIVE_STATUSES,
      })
      .getMany();
  }

  private async syncOddsForFixtures(
    fixtures: Fixture[],
    phase: Phase,
  ): Promise<{ fixturesProcessed: number; snapshotsInserted: number }> {
    let snapshotsInserted = 0;

    // Boucle séquentielle volontaire : ce ne sont pas des requêtes DB (pas de N+1)
    // mais des appels au provider externe, dont le quota est déjà contraint par
    // hasRateBudget() au niveau du scheduler. Paralléliser ici amplifierait la
    // consommation de quota par tick.
    for (const fixture of fixtures) {
      const providerFixtureId = fixture.providerFixtureId;
      const response =
        phase === 'PREMATCH'
          ? await this.apiFootballClient.fetchPrematchOdds(providerFixtureId)
          : await this.apiFootballClient.fetchLiveOdds(providerFixtureId);

      snapshotsInserted += await this.ingestOddsResponse(
        fixture,
        response,
        phase,
      );
    }

    this.logger.log(
      {
        event: 'odds_ingestion_completed',
        phase,
        fixturesProcessed: fixtures.length,
        snapshotsInserted,
      },
      'OddsIngestionService',
    );

    return { fixturesProcessed: fixtures.length, snapshotsInserted };
  }

  private async ingestOddsResponse(
    fixture: Fixture,
    response: Record<string, any>[],
    phase: Phase,
  ): Promise<number> {
    const capturedAt = new Date();
    const rows =
      this.apiFootballClient.getProvider() === 'apifootball'
        ? this.buildApifootballRows(fixture, response, phase, capturedAt)
        : this.buildApiSportsRows(fixture, response, phase, capturedAt);

    if (!rows.length) {
      return 0;
    }

    await this.oddsSnapshotRepository.insert(rows);
    return rows.length;
  }

  /** Cotes api-sports v3 : structure imbriquée bookmakers[].bets[].values[],
   * un bookmakerId numérique fourni par le provider. */
  private buildApiSportsRows(
    fixture: Fixture,
    response: Record<string, any>[],
    phase: Phase,
    capturedAt: Date,
  ): Partial<OddsSnapshot>[] {
    const rows: Partial<OddsSnapshot>[] = [];

    for (const entry of response) {
      const bookmakers = Array.isArray(entry?.bookmakers)
        ? entry.bookmakers
        : [];

      for (const bookmaker of bookmakers) {
        const bookmakerId = toNumber(bookmaker?.id);
        const bookmakerName =
          typeof bookmaker?.name === 'string' ? bookmaker.name : null;
        if (bookmakerId === null || !bookmakerName) {
          continue;
        }

        const bets = Array.isArray(bookmaker?.bets) ? bookmaker.bets : [];
        const groups = this.groupBetsByMarket(fixture, bets);

        for (const [marketType, outcomes] of groups) {
          rows.push(
            ...this.buildRowsForMarketGroup(
              fixture,
              bookmakerId,
              bookmakerName,
              marketType,
              outcomes,
              phase,
              capturedAt,
            ),
          );
        }
      }
    }

    return rows;
  }

  /** Cotes apifootball : tableau plat, une ligne par (match × bookmaker),
   * aucun id de bookmaker fourni par le provider (bookmakerId reste NULL). */
  private buildApifootballRows(
    fixture: Fixture,
    response: Record<string, any>[],
    phase: Phase,
    capturedAt: Date,
  ): Partial<OddsSnapshot>[] {
    const rows: Partial<OddsSnapshot>[] = [];

    for (const entry of response) {
      const bookmakerName =
        typeof entry?.odd_bookmakers === 'string' ? entry.odd_bookmakers : null;
      if (!bookmakerName) {
        continue;
      }

      const groups = mapApifootballOddsEntry(entry);

      for (const [marketType, outcomes] of groups) {
        rows.push(
          ...this.buildRowsForMarketGroup(
            fixture,
            null,
            bookmakerName,
            marketType,
            outcomes,
            phase,
            capturedAt,
          ),
        );
      }
    }

    return rows;
  }

  /**
   * Construit les lignes à insérer pour un groupe (marketType, outcomes) d'un
   * bookmaker donné. Partition (1X2, O/U, handicap asiatique, BTTS) : calcule
   * raw + fair + overround, rejette le groupe s'il est incomplet. Non-partition
   * (double chance) : ne stocke que la probabilité brute, fair/overround à NULL.
   */
  private buildRowsForMarketGroup(
    fixture: Fixture,
    bookmakerId: number | null,
    bookmakerName: string,
    marketType: string,
    outcomes: OddsOutcome[],
    phase: Phase,
    capturedAt: Date,
  ): Partial<OddsSnapshot>[] {
    if (!isPartitionMarket(marketType)) {
      return outcomes.map((outcome) => ({
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        bookmakerId,
        bookmakerName,
        marketType,
        outcome: outcome.outcome,
        oddValue: outcome.oddValue,
        impliedProbabilityRaw: impliedProbability(outcome.oddValue) ?? 0,
        impliedProbabilityFair: null,
        overround: null,
        phase,
        capturedAt,
      }));
    }

    const expected = this.expectedOutcomeCount(marketType);
    if (outcomes.length !== expected) {
      // Marché incomplet : l'overround serait faux. On saute le groupe
      // entier plutôt que d'écrire une impliedProbabilityFair trompeuse.
      this.logger.warn(
        {
          event: 'odds_ingestion_incomplete_market',
          fixtureId: fixture.id,
          providerFixtureId: fixture.providerFixtureId,
          bookmakerId,
          bookmakerName,
          marketType,
          outcomesFound: outcomes.length,
          outcomesExpected: expected,
        },
        'OddsIngestionService',
      );
      return [];
    }

    const { raw, fair, overround } = removeMargin(
      outcomes.map((o) => o.oddValue),
    );

    return outcomes.map((outcome, index) => ({
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      bookmakerId,
      bookmakerName,
      marketType,
      outcome: outcome.outcome,
      oddValue: outcome.oddValue,
      impliedProbabilityRaw: raw[index],
      impliedProbabilityFair: fair[index],
      overround,
      phase,
      capturedAt,
    }));
  }

  /** Regroupe les values des bets par marketType normalisé. */
  private groupBetsByMarket(
    fixture: Fixture,
    bets: Record<string, any>[],
  ): Map<string, OddsOutcome[]> {
    const groups = new Map<string, OddsOutcome[]>();

    for (const bet of bets) {
      const betName = String(bet?.name ?? '');
      const values = Array.isArray(bet?.values) ? bet.values : [];

      for (const value of values) {
        const mapped = this.mapBetValueToMarket(
          betName,
          String(value?.value ?? ''),
        );
        if (!mapped) {
          continue;
        }

        const oddValue = toNumber(value?.odd);
        if (oddValue === null || impliedProbability(oddValue) === null) {
          this.logger.warn(
            {
              event: 'odds_ingestion_invalid_odd',
              fixtureId: fixture.id,
              providerFixtureId: fixture.providerFixtureId,
              marketType: mapped.marketType,
              outcome: mapped.outcome,
              rawOdd: value?.odd,
            },
            'OddsIngestionService',
          );
          continue;
        }

        const bucket = groups.get(mapped.marketType) ?? [];
        bucket.push({ outcome: mapped.outcome, oddValue });
        groups.set(mapped.marketType, bucket);
      }
    }

    return groups;
  }

  /**
   * Normalise un nom de bet + label de value api-sports v3 en (marketType, outcome).
   * Convention retenue : `1X2` (HOME/DRAW/AWAY), `BTTS` (YES/NO),
   * `OU_<ligne>` ex. `OU_2.5` (OVER/UNDER). Bet non reconnu → null (ignoré).
   */
  private mapBetValueToMarket(
    betName: string,
    valueLabel: string,
  ): { marketType: string; outcome: string } | null {
    const name = betName.toLowerCase();
    const label = valueLabel.toLowerCase().trim();

    if (name.includes('match winner') || name === '1x2') {
      if (label === 'home') return { marketType: '1X2', outcome: 'HOME' };
      if (label === 'draw') return { marketType: '1X2', outcome: 'DRAW' };
      if (label === 'away') return { marketType: '1X2', outcome: 'AWAY' };
      return null;
    }

    if (name.includes('both teams score')) {
      if (label === 'yes') return { marketType: 'BTTS', outcome: 'YES' };
      if (label === 'no') return { marketType: 'BTTS', outcome: 'NO' };
      return null;
    }

    if (name.includes('over/under')) {
      const match = /^(over|under)\s+([\d.]+)$/.exec(label);
      if (!match) {
        return null;
      }
      const [, side, line] = match;
      return { marketType: `OU_${line}`, outcome: side.toUpperCase() };
    }

    return null;
  }

  private expectedOutcomeCount(marketType: string): number {
    if (marketType === '1X2') return 3;
    if (marketType === 'BTTS') return 2;
    if (marketType.startsWith('OU_')) return 2;
    if (marketType.startsWith('AH_')) return 2;
    return 0;
  }
}
