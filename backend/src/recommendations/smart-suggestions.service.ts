import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { SmartCoupon } from '../database/entities/smart-coupon.entity';
import { JsonLogger } from '../common/json.logger';
import {
  extractTotalShots,
  extractHtScore,
  getStatValue,
  computePressureIndex,
} from '../common/utils/stats.utils';
import {
  SmartRulesConfigService,
  SmartRulesConfig,
  SignalType,
} from '../settings/smart-rules-config.service';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';
import {
  evaluateRules,
  RuleEvaluationInput,
  FIRST_HALF_STATUSES,
  SECOND_HALF_STATUSES,
} from './rules/rules-evaluator';
import {
  resolveOutcome,
  ResolvableBet,
  FinalMatchState,
} from './rules/outcome-resolver';
import {
  BaseRatesService,
  MARKET_TYPE_TO_BASE_RATE,
  SIGNAL_TO_BASE_RATE,
  baseRateKey,
} from '../analytics/base-rates.service';

/** Les trois signaux offensifs extraits d'un snapshot (LOT 3). */
interface SnapshotSignals {
  totalShots: number | null;
  shotsOnTarget: number;
  pressureIndex: number;
}

function snapshotSignals(stats: Record<string, unknown>): SnapshotSignals {
  return {
    totalShots: extractTotalShots(stats),
    shotsOnTarget: getStatValue(stats, ['On Target', 'Shots on Goal']),
    pressureIndex: computePressureIndex(stats),
  };
}

export type SmartSuggestion = {
  id: string;
  fixtureId: string;
  fixtureLabel: string;
  marketType: string;
  selection: string;
  currentOdd: number;
  minAcceptableOdd: number;
  edgePct: number;
  /** Taux de base réel (%) du LOT 2, ou `null` si aucun échantillon suffisant — plus jamais inventé. */
  confidenceScore: number | null;
  /** Taille d'échantillon du taux de base ci-dessus (à afficher à côté). */
  baseRateSampleSize: number | null;
  reasons: string[];
  riskFlags: string[];
  status: 'NEW';
  ruleName: string;
  elapsed: number | null;
  shotsCount: number;
  /** ID de l'équipe concernée */
  teamId: number | null;
  teamName: string;
  isHomeTeam: boolean;
};

const AUTO_MARKET_TYPES = [
  'Buts 1ère mi-temps',
  'Buts match',
  'Buts 2ème mi-temps',
];

type LiveOddsMap = Map<
  number,
  { ou05Over: number | null; ou05Under: number | null }
>;

@Injectable()
export class SmartSuggestionsService {
  constructor(
    @InjectRepository(Fixture)
    private readonly fixtureRepo: Repository<Fixture>,
    @InjectRepository(FixtureStatsSnapshot)
    private readonly statsRepo: Repository<FixtureStatsSnapshot>,
    @InjectRepository(BetRecommendation)
    private readonly recoRepo: Repository<BetRecommendation>,
    @InjectRepository(SmartCoupon)
    private readonly couponRepo: Repository<SmartCoupon>,
    private readonly configService: SmartRulesConfigService,
    private readonly apiClient: ApiFootballClient,
    private readonly baseRatesService: BaseRatesService,
    private readonly logger: JsonLogger,
  ) {}

  // ── API publique ─────────────────────────────────────────────

  /** Retourne toutes les suggestions calculées en temps réel. */
  async getAllSuggestions(): Promise<SmartSuggestion[]> {
    const [config, liveOdds] = await Promise.all([
      this.configService.getConfig(),
      this.apiClient.fetchAllLiveOdds().catch(() => new Map() as LiveOddsMap),
    ]);
    const [firstHalf, secondHalf] = await Promise.all([
      this.getFirstHalfSuggestions(config, liveOdds),
      this.getSecondHalfSuggestions(config, liveOdds),
    ]);
    return [...firstHalf, ...secondHalf];
  }

  /**
   * Évalue toutes les règles et persiste les nouvelles suggestions.
   * La résolution des coupons est toujours exécutée en `finally` pour
   * garantir qu'elle s'exécute même si la génération de suggestions échoue.
   */
  async evaluateAndSave(): Promise<void> {
    try {
      const suggestions = await this.getAllSuggestions();

      // ── BetRecommendation (existant) ──────────────────────────
      if (suggestions.length) {
        const fixtureIds = [...new Set(suggestions.map((s) => s.fixtureId))];
        await this.recoRepo.delete({
          fixtureId: In(fixtureIds),
          status: 'NEW',
          marketType: In(AUTO_MARKET_TYPES),
        });
        await this.recoRepo.save(
          suggestions.map((s) =>
            this.recoRepo.create({
              fixtureId: s.fixtureId,
              marketType: s.marketType,
              selection: s.selection,
              currentOdd: s.currentOdd,
              minAcceptableOdd: s.minAcceptableOdd,
              edgePct: s.edgePct,
              confidenceScore: s.confidenceScore,
              baseRateSampleSize: s.baseRateSampleSize,
              reasons: s.reasons,
              riskFlags: [],
              status: 'NEW',
            }),
          ),
        );
      }

      // ── SmartCoupon (nouveau) ─────────────────────────────────
      await this.saveCoupons(suggestions);

      this.logger.log(
        { event: 'smart_suggestions_saved', count: suggestions.length },
        'SmartSuggestionsService',
      );
    } finally {
      // ── Résolution systématique à chaque sync ─────────────────
      // Exécutée même si la génération de suggestions a échoué :
      // vérifie buts marqués en live ET matchs terminés (WON/LOST).
      await this.resolveSettledCoupons();
    }
  }

  /** Historique paginé des coupons (tous statuts). */
  async getCouponHistory(
    limit = 50,
    offset = 0,
  ): Promise<{ data: SmartCoupon[]; total: number }> {
    const [data, total] = await this.couponRepo.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  // ── Sauvegarde coupons ───────────────────────────────────────

  private async saveCoupons(suggestions: SmartSuggestion[]): Promise<void> {
    if (!suggestions.length) return;

    const fixtureIds = [...new Set(suggestions.map((s) => s.fixtureId))];
    // Dédupliquer contre TOUS les statuts, pas seulement PENDING : un coupon
    // résolu (WON/LOST) sortait du filtre et la même suggestion, toujours
    // active au tick suivant, recréait indéfiniment le même pari.
    const existing =
      (await this.couponRepo.findBy({
        fixtureId: In(fixtureIds),
      })) ?? [];
    const existingKeys = new Set(
      existing.map((c) => `${c.fixtureId}|${c.teamId ?? ''}|${c.marketType}`),
    );

    const toInsert = suggestions
      .filter(
        (s) =>
          !existingKeys.has(`${s.fixtureId}|${s.teamId ?? ''}|${s.marketType}`),
      )
      .map((s) => {
        const [home, away] = s.fixtureLabel.split(' vs ');
        return this.couponRepo.create({
          fixtureId: s.fixtureId,
          homeTeamName: home?.trim() ?? null,
          awayTeamName: away?.trim() ?? null,
          teamId: s.teamId,
          teamName: s.teamName,
          isHomeTeam: s.isHomeTeam,
          marketType: s.marketType,
          selection: s.selection,
          currentOdd: s.currentOdd,
          minAcceptableOdd: s.minAcceptableOdd,
          edgePct: s.edgePct,
          confidenceScore: s.confidenceScore,
          baseRateSampleSize: s.baseRateSampleSize,
          reasons: s.reasons,
          ruleName: s.ruleName,
          elapsedAtSuggestion: s.elapsed,
          shotsCount: s.shotsCount,
          status: 'PENDING',
          resolvedAt: null,
        });
      });

    if (toInsert.length) await this.couponRepo.save(toInsert);
  }

  // ── Résolution automatique ────────────────────────────────────

  /**
   * Job cron : toutes les 2 minutes, résout les coupons PENDING dont le match
   * ou la période concernée est terminée — indépendamment du cycle de sync.
   */
  @Cron('0 */2 * * * *')
  async scheduledResolveCoupons(): Promise<void> {
    try {
      await this.resolveSettledCoupons();
    } catch (err: unknown) {
      this.logger.warn(
        { event: 'coupon_resolution_cron_failed', error: String(err) },
        'SmartSuggestionsService',
      );
    }
  }

  async resolveSettledCoupons(): Promise<void> {
    const pending = await this.couponRepo.find({
      where: { status: 'PENDING' },
    });
    if (!pending.length) return;

    const fixtureIds = [...new Set(pending.map((c) => c.fixtureId))];
    const fixtures = await this.fixtureRepo.findBy({ id: In(fixtureIds) });
    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));

    const now = new Date();

    for (const coupon of pending) {
      const fixture = fixtureMap.get(coupon.fixtureId);
      if (!fixture) continue;

      const bet: ResolvableBet = {
        marketType: coupon.marketType,
        isHomeTeam: coupon.isHomeTeam,
      };
      const resolved = resolveOutcome(bet, this.toFinalMatchState(fixture));
      if (resolved === null) continue; // pas encore décidable

      coupon.status = resolved;
      coupon.resolvedAt = now;
      await this.couponRepo.save(coupon);
    }
  }

  /** Construit l'état final normalisé attendu par le résolveur pur. */
  private toFinalMatchState(fixture: Fixture): FinalMatchState {
    const raw = (fixture.raw ?? {}) as Record<string, unknown>;
    return {
      statusShort: fixture.statusShort ?? '',
      scoreHome: fixture.scoreHome,
      scoreAway: fixture.scoreAway,
      htScoreHome: extractHtScore(raw, true),
      htScoreAway: extractHtScore(raw, false),
    };
  }

  // ── Règles par mi-temps ──────────────────────────────────────

  private async getFirstHalfSuggestions(
    config: SmartRulesConfig,
    liveOdds: LiveOddsMap,
  ): Promise<SmartSuggestion[]> {
    const maxWindow = Math.max(
      ...config.firstHalfRules.map((r) => r.maxElapsed),
    );

    const fixtures = await this.fixtureRepo
      .createQueryBuilder('f')
      .where('f.statusShort IN (:...statuses)', {
        statuses: FIRST_HALF_STATUSES,
      })
      .andWhere('f.elapsed IS NOT NULL')
      .andWhere('f.elapsed >= 1')
      .andWhere('f.elapsed < :max', { max: maxWindow })
      // Fraîcheur (même convention que isStale, 120 s) : une fixture figée en
      // statut live par une sync interrompue générerait des suggestions — et
      // donc des coupons — sur un match en réalité terminé depuis longtemps.
      .andWhere('f.lastSyncedAt >= :freshAfter', {
        freshAfter: new Date(Date.now() - 120_000),
      })
      .getMany();

    return this.evaluateFixturesWithRules(fixtures, config, liveOdds, 'fh');
  }

  private async getSecondHalfSuggestions(
    config: SmartRulesConfig,
    liveOdds: LiveOddsMap,
  ): Promise<SmartSuggestion[]> {
    const rule = config.secondHalfRule;

    const fixtures = await this.fixtureRepo
      .createQueryBuilder('f')
      .where('f.statusShort IN (:...statuses)', {
        statuses: SECOND_HALF_STATUSES,
      })
      .andWhere('f.elapsed IS NOT NULL')
      .andWhere('f.elapsed >= 45')
      .andWhere('f.elapsed < :max', { max: rule.maxElapsed })
      .andWhere('f.lastSyncedAt >= :freshAfter', {
        freshAfter: new Date(Date.now() - 120_000),
      })
      .getMany();

    if (!fixtures.length) return [];

    const htBaseline = await this.buildHtBaseline(fixtures);

    return this.evaluateFixturesWithRules(
      fixtures,
      config,
      liveOdds,
      'sh',
      htBaseline,
    );
  }

  /**
   * Snapshots HT : dernier snapshot par (fixtureId, teamId) avec elapsed ≤ 45.
   * Sert de baseline pour ne comptabiliser que les tirs de la 2ème mi-temps.
   */
  private async buildHtBaseline(
    fixtures: Fixture[],
  ): Promise<Map<string, SnapshotSignals>> {
    const fixtureIds = fixtures.map((f) => f.id);
    const htSnapshots = await this.statsRepo
      .createQueryBuilder('s')
      .where('s.fixtureId IN (:...ids)', { ids: fixtureIds })
      .andWhere('s.elapsed <= 45')
      .orderBy('s.snapshotAt', 'DESC')
      .getMany();

    const htBaseline = new Map<string, SnapshotSignals>();
    for (const snap of htSnapshots) {
      if (!snap.teamId) continue;
      const key = `${snap.fixtureId}:${snap.teamId}`;
      if (!htBaseline.has(key)) {
        htBaseline.set(key, snapshotSignals(snap.stats));
      }
    }
    return htBaseline;
  }

  // ── Moteur d'évaluation partagé ──────────────────────────────

  /**
   * Adaptateur : charge les entités, construit l'input de l'évaluateur pur
   * et mappe les `RuleMatch` obtenus vers des `SmartSuggestion` persistables.
   * Aucune logique de règle n'est appliquée ici (voir rules/rules-evaluator.ts).
   */
  private async evaluateFixturesWithRules(
    fixtures: Fixture[],
    config: SmartRulesConfig,
    liveOdds: LiveOddsMap,
    halfSuffix: string,
    htBaseline?: Map<string, SnapshotSignals>,
  ): Promise<SmartSuggestion[]> {
    if (!fixtures.length) return [];

    const signal: SignalType = config.signal ?? 'TOTAL_SHOTS';
    const fixtureIds = fixtures.map((f) => f.id);
    const allSnapshots = await this.statsRepo
      .createQueryBuilder('s')
      .where('s.fixtureId IN (:...ids)', { ids: fixtureIds })
      .orderBy('s.snapshotAt', 'DESC')
      .getMany();

    // Taux de base préchargés (LOT 2) : une requête pour tout le lot de fixtures,
    // pour le signal effectivement en usage (LOT 3).
    const baseRatePairs = fixtures
      .filter((f) => f.leagueId !== null && f.season !== null)
      .map((f) => ({ leagueId: f.leagueId!, season: f.season! }));
    const baseRateLookup = await this.baseRatesService.buildLookup(
      baseRatePairs,
      SIGNAL_TO_BASE_RATE[signal],
    );

    // Snapshot le plus récent par (fixtureId, teamId)
    const latestByTeam = new Map<string, Map<number, FixtureStatsSnapshot>>();
    for (const snap of allSnapshots) {
      if (!snap.teamId) continue;
      if (!latestByTeam.has(snap.fixtureId))
        latestByTeam.set(snap.fixtureId, new Map());
      const tm = latestByTeam.get(snap.fixtureId)!;
      if (!tm.has(snap.teamId)) tm.set(snap.teamId, snap);
    }

    const suggestions: SmartSuggestion[] = [];

    for (const fixture of fixtures) {
      const teamMap = latestByTeam.get(fixture.id);
      if (!teamMap) continue;
      if (fixture.homeTeamId === null || fixture.awayTeamId === null) continue;

      const homeSnap = teamMap.get(fixture.homeTeamId);
      const awaySnap = teamMap.get(fixture.awayTeamId);

      const elapsed = fixture.elapsed ?? 0;
      const provId = fixture.providerFixtureId
        ? Number(fixture.providerFixtureId)
        : null;
      const liveOdd =
        provId !== null && !Number.isNaN(provId)
          ? (liveOdds.get(provId)?.ou05Over ?? null)
          : null;

      const homeSignals = homeSnap
        ? snapshotSignals(homeSnap.stats)
        : { totalShots: null, shotsOnTarget: null, pressureIndex: null };
      const awaySignals = awaySnap
        ? snapshotSignals(awaySnap.stats)
        : { totalShots: null, shotsOnTarget: null, pressureIndex: null };
      const htHome = htBaseline?.get(`${fixture.id}:${fixture.homeTeamId}`);
      const htAway = htBaseline?.get(`${fixture.id}:${fixture.awayTeamId}`);

      const input: RuleEvaluationInput = {
        elapsed,
        statusShort: fixture.statusShort ?? '',
        home: {
          teamId: fixture.homeTeamId,
          teamName: fixture.homeTeamName ?? 'Équipe',
          ...homeSignals,
        },
        away: {
          teamId: fixture.awayTeamId,
          teamName: fixture.awayTeamName ?? 'Équipe',
          ...awaySignals,
        },
        htShots: htBaseline
          ? { home: htHome?.totalShots ?? 0, away: htAway?.totalShots ?? 0 }
          : undefined,
        htOnTarget: htBaseline
          ? {
              home: htHome?.shotsOnTarget ?? 0,
              away: htAway?.shotsOnTarget ?? 0,
            }
          : undefined,
        htPressure: htBaseline
          ? {
              home: htHome?.pressureIndex ?? 0,
              away: htAway?.pressureIndex ?? 0,
            }
          : undefined,
        scoreHome: fixture.scoreHome,
        scoreAway: fixture.scoreAway,
        liveOdd,
      };

      const matches = evaluateRules(input, config);
      if (!matches.length) continue;

      const label = `${fixture.homeTeamName ?? '?'} vs ${fixture.awayTeamName ?? '?'}`;

      // Regroupement par équipe pour préserver le suffixe -a/-b des ids
      const matchesByTeam = new Map<number, typeof matches>();
      for (const match of matches) {
        if (!matchesByTeam.has(match.teamId))
          matchesByTeam.set(match.teamId, []);
        matchesByTeam.get(match.teamId)!.push(match);
      }

      for (const [teamId, teamMatches] of matchesByTeam) {
        const idBase = `smart-${halfSuffix}-${fixture.id}-${teamId}`;
        teamMatches.forEach((match, index) => {
          const baseRate = this.resolveBaseRate(
            fixture,
            match.marketType,
            match.signalThreshold,
            baseRateLookup,
          );
          suggestions.push({
            id: `${idBase}-${index === 0 ? 'a' : 'b'}`,
            fixtureId: fixture.id,
            fixtureLabel: label,
            marketType: match.marketType,
            selection: match.selection,
            currentOdd: match.currentOdd,
            minAcceptableOdd: match.minAcceptableOdd,
            edgePct: match.edgePct,
            confidenceScore: baseRate.confidenceScore,
            baseRateSampleSize: baseRate.sampleSize,
            reasons: match.reasons,
            riskFlags: [],
            status: 'NEW',
            ruleName: match.ruleName,
            elapsed: match.elapsed,
            shotsCount: match.shotsCount,
            teamId: match.teamId,
            teamName: match.teamName,
            isHomeTeam: match.isHomeTeam,
          });
        });
      }
    }

    return suggestions;
  }

  /**
   * Confiance = taux de base réel du LOT 2 (en %), jamais une constante inventée.
   * `null` si le championnat/saison n'a pas d'échantillon suffisant pour ce
   * marché à ce seuil de tirs.
   */
  private resolveBaseRate(
    fixture: Fixture,
    marketType: string,
    signalThreshold: number,
    lookup: Map<string, { observedRate: number; sampleSize: number }>,
  ): { confidenceScore: number | null; sampleSize: number | null } {
    const market = MARKET_TYPE_TO_BASE_RATE[marketType];
    if (!market || fixture.leagueId === null || fixture.season === null) {
      return { confidenceScore: null, sampleSize: null };
    }

    const hit = lookup.get(
      baseRateKey(fixture.leagueId, fixture.season, market, signalThreshold),
    );
    if (!hit) {
      return { confidenceScore: null, sampleSize: null };
    }

    return {
      confidenceScore: Math.round(hit.observedRate * 100),
      sampleSize: hit.sampleSize,
    };
  }
}
