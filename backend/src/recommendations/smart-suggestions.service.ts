import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { SmartCoupon } from '../database/entities/smart-coupon.entity';
import { JsonLogger } from '../common/json.logger';
import { SmartRulesConfigService, DEFAULT_CONFIG } from '../settings/smart-rules-config.service';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';

export type SmartSuggestion = {
  id: string;
  fixtureId: string;
  fixtureLabel: string;
  marketType: string;
  selection: string;
  currentOdd: number;
  minAcceptableOdd: number;
  edgePct: number;
  confidenceScore: number;
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

const FIRST_HALF_STATUSES  = ['1H', 'LIVE'];
const SECOND_HALF_STATUSES = ['2H', 'LIVE'];
const AUTO_MARKET_TYPES    = ['Buts 1ère mi-temps', 'Buts match', 'Buts 2ème mi-temps'];

// Statuts indiquant que la mi-temps est terminée (score HT connu)
const POST_HT_STATUSES = new Set(['HT', '2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN', 'AWD', 'WO']);
// Statuts indiquant que le match est terminé (score FT connu)
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
// Statuts indiquant que le match ne se jouera pas / a été interrompu définitivement → coupon LOST
const VOID_STATUSES = new Set(['Cancelled', 'Postponed', 'INT', 'Susp', 'ABD', 'TBD']);

type SuggestionPartial = Pick<
  SmartSuggestion,
  'marketType' | 'selection' | 'currentOdd' | 'minAcceptableOdd' | 'edgePct' | 'confidenceScore' | 'reasons'
>;
type SuggestionBuilder = (
  teamName: string,
  elapsed: number,
  shots: number,
  rule: { maxElapsed: number; minShots: number },
  liveOdd: number | null,
) => SuggestionPartial;

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
    private readonly logger: JsonLogger,
  ) {}

  // ── API publique ─────────────────────────────────────────────

  /** Retourne toutes les suggestions calculées en temps réel. */
  async getAllSuggestions(): Promise<SmartSuggestion[]> {
    const [config, liveOdds] = await Promise.all([
      this.configService.getConfig(),
      this.apiClient.fetchAllLiveOdds().catch(() => new Map<number, { ou05Over: number | null; ou05Under: number | null }>()),
    ]);
    const [firstHalf, secondHalf] = await Promise.all([
      this.getFirstHalfSuggestions(config, liveOdds),
      this.getSecondHalfSuggestions(config, liveOdds),
    ]);
    return [...firstHalf, ...secondHalf];
  }

  /**
   * Évalue toutes les règles, persiste les résultats dans bet_recommendations
   * et smart_coupons, puis résout les coupons des matchs terminés.
   */
  async evaluateAndSave(): Promise<void> {
    const suggestions = await this.getAllSuggestions();

    // ── BetRecommendation (existant) ──────────────────────────
    if (suggestions.length) {
      const fixtureIds = [...new Set(suggestions.map((s) => s.fixtureId))];
      await this.recoRepo.delete({
        fixtureId:  In(fixtureIds),
        status:     'NEW',
        marketType: In(AUTO_MARKET_TYPES),
      });
      await this.recoRepo.save(
        suggestions.map((s) =>
          this.recoRepo.create({
            fixtureId:        s.fixtureId,
            marketType:       s.marketType,
            selection:        s.selection,
            currentOdd:       s.currentOdd,
            minAcceptableOdd: s.minAcceptableOdd,
            edgePct:          s.edgePct,
            confidenceScore:  s.confidenceScore,
            reasons:          s.reasons,
            riskFlags:        [],
            status:           'NEW',
          }),
        ),
      );
    }

    // ── SmartCoupon (nouveau) ─────────────────────────────────
    await this.saveCoupons(suggestions);

    // ── Résolution automatique ────────────────────────────────
    await this.resolveSettledCoupons();

    this.logger.log(
      { event: 'smart_suggestions_saved', count: suggestions.length },
      'SmartSuggestionsService',
    );
  }

  /** Historique paginé des coupons (tous statuts). */
  async getCouponHistory(limit = 50, offset = 0): Promise<{ data: SmartCoupon[]; total: number }> {
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

    for (const s of suggestions) {
      // Éviter les doublons : un seul coupon PENDING par (fixtureId, teamId, marketType)
      const existing = await this.couponRepo.findOne({
        where: {
          fixtureId:  s.fixtureId,
          teamId:     s.teamId ?? undefined,
          marketType: s.marketType,
          status:     'PENDING',
        },
      });
      if (existing) continue;

      const [home, away] = s.fixtureLabel.split(' vs ');
      await this.couponRepo.save(
        this.couponRepo.create({
          fixtureId:           s.fixtureId,
          homeTeamName:        home?.trim() ?? null,
          awayTeamName:        away?.trim() ?? null,
          teamId:              s.teamId,
          teamName:            s.teamName,
          isHomeTeam:          s.isHomeTeam,
          marketType:          s.marketType,
          selection:           s.selection,
          currentOdd:          s.currentOdd,
          minAcceptableOdd:    s.minAcceptableOdd,
          edgePct:             s.edgePct,
          confidenceScore:     s.confidenceScore,
          reasons:             s.reasons,
          ruleName:            s.ruleName,
          elapsedAtSuggestion: s.elapsed,
          shotsCount:          s.shotsCount,
          status:              'PENDING',
          resolvedAt:          null,
        }),
      );
    }
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
    const pending = await this.couponRepo.find({ where: { status: 'PENDING' } });
    if (!pending.length) return;

    const fixtureIds = [...new Set(pending.map((c) => c.fixtureId))];
    const fixtures   = await this.fixtureRepo.findBy({ id: In(fixtureIds) });
    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));

    const now = new Date();

    for (const coupon of pending) {
      const fixture = fixtureMap.get(coupon.fixtureId);
      if (!fixture) continue;

      const status = fixture.statusShort ?? '';
      const resolved = this.resolveCouponOutcome(coupon, fixture, status);
      if (resolved === null) continue; // pas encore décidable

      coupon.status     = resolved;
      coupon.resolvedAt = now;
      await this.couponRepo.save(coupon);
    }
  }

  /**
   * Retourne 'WON' | 'LOST' si le résultat est connu, null si le match
   * n'est pas encore à un stade permettant la résolution.
   */
  private resolveCouponOutcome(
    coupon: SmartCoupon,
    fixture: Fixture,
    statusShort: string,
  ): 'WON' | 'LOST' | null {
    // Match annulé / reporté / interrompu → coupon perdu (période ne se jouera pas)
    if (VOID_STATUSES.has(statusShort)) return 'LOST';

    const raw = (fixture.raw ?? {}) as Record<string, unknown>;

    // ── Buts 1ère mi-temps ──────────────────────────────────────
    if (coupon.marketType === 'Buts 1ère mi-temps') {
      if (!POST_HT_STATUSES.has(statusShort)) return null;
      const htHome = this.extractHtScore(raw, true);
      const htAway = this.extractHtScore(raw, false);
      const teamHt = coupon.isHomeTeam ? htHome : htAway;
      if (teamHt === null) return null;
      return teamHt > 0 ? 'WON' : 'LOST';
    }

    // ── Buts match ──────────────────────────────────────────────
    if (coupon.marketType === 'Buts match') {
      if (!FINISHED_STATUSES.has(statusShort)) return null;
      const teamScore = coupon.isHomeTeam ? fixture.scoreHome : fixture.scoreAway;
      if (teamScore === null || teamScore === undefined) return null;
      return teamScore > 0 ? 'WON' : 'LOST';
    }

    // ── Buts 2ème mi-temps ──────────────────────────────────────
    if (coupon.marketType === 'Buts 2ème mi-temps') {
      if (!FINISHED_STATUSES.has(statusShort)) return null;
      const ftScore = coupon.isHomeTeam ? fixture.scoreHome : fixture.scoreAway;
      const htScore = this.extractHtScore(raw, coupon.isHomeTeam);
      if (ftScore === null || ftScore === undefined) return null;
      // Si on ne peut pas déterminer le score HT, on utilise juste le score FT
      const secondHalfGoals = htScore !== null ? ftScore - htScore : ftScore;
      return secondHalfGoals > 0 ? 'WON' : 'LOST';
    }

    return null;
  }

  /** Extrait le score à la mi-temps depuis le champ `raw` de la fixture. */
  private extractHtScore(raw: Record<string, unknown>, isHome: boolean): number | null {
    // Format apifootball
    const apifootballKey = isHome ? 'match_hometeam_halftime_score' : 'match_awayteam_halftime_score';
    if (raw[apifootballKey] !== undefined && raw[apifootballKey] !== '') {
      const n = Number(raw[apifootballKey]);
      if (!Number.isNaN(n)) return n;
    }
    // Format api-sports
    const apiSportsScore = (raw as any)?.score?.halftime;
    if (apiSportsScore) {
      const val = isHome ? apiSportsScore.home : apiSportsScore.away;
      if (val !== null && val !== undefined) {
        const n = Number(val);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  }

  // ── Règles par mi-temps ──────────────────────────────────────

  private async getFirstHalfSuggestions(
    config: typeof DEFAULT_CONFIG,
    liveOdds: Map<number, { ou05Over: number | null; ou05Under: number | null }>,
  ): Promise<SmartSuggestion[]> {
    const rules     = config.firstHalfRules;
    const oddsHT    = config.odds.firstHalfHT;
    const oddsFT    = config.odds.firstHalfFT;
    const maxWindow = Math.max(...rules.map((r) => r.maxElapsed));

    const fixtures = await this.fixtureRepo
      .createQueryBuilder('f')
      .where('f.statusShort IN (:...statuses)', { statuses: FIRST_HALF_STATUSES })
      .andWhere('f.elapsed IS NOT NULL')
      .andWhere('f.elapsed >= 1')
      .andWhere('f.elapsed < :max', { max: maxWindow })
      .getMany();

    return this.evaluateFixtures({
      fixtures,
      liveOdds,
      rules,
      halfSuffix: 'fh',

      buildPrimary: (teamName, elapsed, shots, rule, liveOdd) => ({
        marketType:       'Buts 1ère mi-temps',
        selection:        `${teamName} marque avant la mi-temps (+0.5)`,
        currentOdd:       liveOdd ?? oddsHT.current,
        minAcceptableOdd: oddsHT.min,
        edgePct:          oddsHT.edgePct,
        confidenceScore:  oddsHT.confidence,
        reasons: [
          `${shots} tirs à ${elapsed}' (seuil : ≥${rule.minShots} avant ${rule.maxElapsed}')`,
          'Forte pression offensive',
          'Probabilité accrue de marquer avant la mi-temps',
        ],
      }),
      buildSecondary: (teamName, elapsed, shots, rule, liveOdd) => ({
        marketType:       'Buts match',
        selection:        `${teamName} marque dans le match (+0.5)`,
        currentOdd:       liveOdd ?? oddsFT.current,
        minAcceptableOdd: oddsFT.min,
        edgePct:          oddsFT.edgePct,
        confidenceScore:  oddsFT.confidence,
        reasons: [
          `${shots} tirs à ${elapsed}' (seuil : ≥${rule.minShots} avant ${rule.maxElapsed}')`,
          'Domination offensive confirmée',
          'Haute probabilité de scorer sur 90 minutes',
        ],
      }),
    });
  }

  private async getSecondHalfSuggestions(
    config: typeof DEFAULT_CONFIG,
    liveOdds: Map<number, { ou05Over: number | null; ou05Under: number | null }>,
  ): Promise<SmartSuggestion[]> {
    const rule = config.secondHalfRule;
    const odds = config.odds.secondHalf;

    const fixtures = await this.fixtureRepo
      .createQueryBuilder('f')
      .where('f.statusShort IN (:...statuses)', { statuses: SECOND_HALF_STATUSES })
      .andWhere('f.elapsed IS NOT NULL')
      .andWhere('f.elapsed >= 45')
      .andWhere('f.elapsed < :max', { max: rule.maxElapsed })
      .getMany();

    if (!fixtures.length) return [];

    // Snapshots HT : dernier snapshot par (fixtureId, teamId) avec elapsed ≤ 45
    // Sert de baseline pour ne comptabiliser que les tirs de la 2ème mi-temps
    const fixtureIds = fixtures.map((f) => f.id);
    const htSnapshots = await this.statsRepo
      .createQueryBuilder('s')
      .where('s.fixtureId IN (:...ids)', { ids: fixtureIds })
      .andWhere('s.elapsed <= 45')
      .orderBy('s.snapshotAt', 'DESC')
      .getMany();

    // Map : `${fixtureId}:${teamId}` → tirs à la mi-temps
    const htBaseline = new Map<string, number>();
    for (const snap of htSnapshots) {
      if (!snap.teamId) continue;
      const key = `${snap.fixtureId}:${snap.teamId}`;
      if (!htBaseline.has(key)) {
        const shots = this.extractTotalShots(snap.stats);
        if (shots !== null) htBaseline.set(key, shots);
      }
    }

    return this.evaluateFixtures({
      fixtures,
      liveOdds,
      htBaseline,
      rules: [rule],
      halfSuffix: 'sh',
      buildPrimary: (teamName, elapsed, shots, rule, liveOdd) => ({
        marketType:       'Buts 2ème mi-temps',
        selection:        `${teamName} marque en 2ème mi-temps (+0.5)`,
        currentOdd:       liveOdd ?? odds.current,
        minAcceptableOdd: odds.min,
        edgePct:          odds.edgePct,
        confidenceScore:  odds.confidence,
        reasons: [
          `${shots} tirs en 2MT à ${elapsed}' (seuil : ≥${rule.minShots} avant ${rule.maxElapsed}')`,
          'Pression offensive confirmée en 2ème mi-temps',
          'Fort potentiel de marquer avant la fin du match',
        ],
      }),
      buildSecondary: null,
    });
  }

  // ── Moteur d'évaluation partagé ──────────────────────────────

  private async evaluateFixtures(opts: {
    fixtures:       Fixture[];
    liveOdds:       Map<number, { ou05Over: number | null; ou05Under: number | null }>;
    /** Baseline de tirs à soustraire (tirs à la MT pour les règles 2ème mi-temps) */
    htBaseline?:    Map<string, number>;
    rules:          { maxElapsed: number; minShots: number }[];
    halfSuffix:     string;
    buildPrimary:   SuggestionBuilder;
    buildSecondary: SuggestionBuilder | null;
  }): Promise<SmartSuggestion[]> {
    if (!opts.fixtures.length) return [];

    const fixtureIds   = opts.fixtures.map((f) => f.id);
    const allSnapshots = await this.statsRepo
      .createQueryBuilder('s')
      .where('s.fixtureId IN (:...ids)', { ids: fixtureIds })
      .orderBy('s.snapshotAt', 'DESC')
      .getMany();

    // Snapshot le plus récent par (fixtureId, teamId)
    const latestByTeam = new Map<string, Map<number, FixtureStatsSnapshot>>();
    for (const snap of allSnapshots) {
      if (!snap.teamId) continue;
      if (!latestByTeam.has(snap.fixtureId)) latestByTeam.set(snap.fixtureId, new Map());
      const tm = latestByTeam.get(snap.fixtureId)!;
      if (!tm.has(snap.teamId)) tm.set(snap.teamId, snap);
    }

    const suggestions: SmartSuggestion[] = [];

    for (const fixture of opts.fixtures) {
      const teamMap = latestByTeam.get(fixture.id);
      if (!teamMap) continue;

      for (const [teamId, snap] of teamMap) {
        const totalShots = this.extractTotalShots(snap.stats);
        const elapsed    = fixture.elapsed ?? 0;
        if (totalShots === null) continue;

        // Si une baseline HT est fournie, ne garder que les tirs de la 2ème MT
        const htShots = opts.htBaseline?.get(`${fixture.id}:${teamId}`) ?? 0;
        const shots   = Math.max(0, totalShots - htShots);

        const matchedRule = opts.rules.find(
          (r) => elapsed < r.maxElapsed && shots >= r.minShots,
        );
        if (!matchedRule) continue;

        const isHome   = teamId === fixture.homeTeamId;
        const teamName = (isHome ? fixture.homeTeamName : fixture.awayTeamName) ?? 'Équipe';
        const label    = `${fixture.homeTeamName ?? '?'} vs ${fixture.awayTeamName ?? '?'}`;
        const idBase   = `smart-${opts.halfSuffix}-${fixture.id}-${teamId}`;

        const provId   = fixture.providerFixtureId ? Number(fixture.providerFixtureId) : null;
        const liveOdd  = (provId !== null && !Number.isNaN(provId))
          ? (opts.liveOdds.get(provId)?.ou05Over ?? null)
          : null;

        const primary = opts.buildPrimary(teamName, elapsed, shots, matchedRule, liveOdd);
        suggestions.push({
          id: `${idBase}-a`, fixtureId: fixture.id, fixtureLabel: label,
          ...primary, riskFlags: [], status: 'NEW',
          ruleName: 'shots-pressure', elapsed, shotsCount: shots,
          teamId, teamName, isHomeTeam: isHome,
        });

        if (opts.buildSecondary) {
          const secondary = opts.buildSecondary(teamName, elapsed, shots, matchedRule, liveOdd);
          suggestions.push({
            id: `${idBase}-b`, fixtureId: fixture.id, fixtureLabel: label,
            ...secondary, riskFlags: [], status: 'NEW',
            ruleName: 'shots-pressure', elapsed, shotsCount: shots,
            teamId, teamName, isHomeTeam: isHome,
          });
        }
      }
    }

    return suggestions;
  }

  // ── Utilitaires ──────────────────────────────────────────────

  private extractTotalShots(stats: Record<string, unknown>): number | null {
    // Noms de type selon le provider :
    // api-sports   → "Total Shots"
    // apifootball  → "Shots Total", ou somme "On Target" + "Off Target"
    const TOTAL_SHOTS_TYPES = ['total shots', 'shots total'];

    const statistics = stats?.statistics;
    if (Array.isArray(statistics)) {
      const arr = statistics as Array<{ type?: string; value?: unknown }>;

      for (const entry of arr) {
        if (entry.type && TOTAL_SHOTS_TYPES.includes(entry.type.toLowerCase())) {
          const n = Number(entry.value);
          if (!Number.isNaN(n)) return n;
        }
      }

      // Fallback : On Target + Off Target (format apifootball)
      const getValue = (type: string) => {
        const e = arr.find((x) => x.type?.toLowerCase() === type);
        return e ? Number(e.value) : NaN;
      };
      const onTarget  = getValue('on target');
      const offTarget = getValue('off target');
      if (!Number.isNaN(onTarget) && !Number.isNaN(offTarget)) return onTarget + offTarget;
      if (!Number.isNaN(onTarget)) return onTarget;
    }

    const flat = stats?.total_shots ?? stats?.shots;
    if (flat !== undefined) {
      const n = Number(flat);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }
}
