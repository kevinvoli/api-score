import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import { BetRecommendation } from '../database/entities/bet-recommendation.entity';
import { JsonLogger } from '../common/json.logger';
import { SmartRulesConfigService, DEFAULT_CONFIG } from '../settings/smart-rules-config.service';

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
};

// ── Règles 1ère mi-temps (progressives) ────────────────────────
// < 10 min  → ≥  5 tirs
// < 20 min  → ≥  7 tirs
// < 30 min  → ≥ 10 tirs  (+3)
// < 40 min  → ≥ 13 tirs  (+3)
// < 45 min  → ≥ 16 tirs  (+3)
const FIRST_HALF_STATUSES = ['1H', 'LIVE'];
const FIRST_HALF_RULES = (() => {
  const rules = [
    { maxElapsed: 10, minShots: 5 },
    { maxElapsed: 20, minShots: 7 },
  ];
  let shots = 7;
  for (const cap of [30, 40, 45]) {
    shots += 3;
    rules.push({ maxElapsed: cap, minShots: shots });
  }
  return rules;
})();

// ── Règle 2ème mi-temps ─────────────────────────────────────────
// avant la 60ème min, ≥ 5 tirs → marque dans la 2ème mi-temps
const SECOND_HALF_STATUSES = ['2H', 'LIVE'];
const SECOND_HALF_RULE = { maxElapsed: 60, minShots: 5 };

// marketTypes générés automatiquement (pour le nettoyage avant re-save)
const AUTO_MARKET_TYPES = ['Buts 1ère mi-temps', 'Buts match', 'Buts 2ème mi-temps'];

type SuggestionPartial = Pick<
  SmartSuggestion,
  'marketType' | 'selection' | 'currentOdd' | 'minAcceptableOdd' | 'edgePct' | 'confidenceScore' | 'reasons'
>;
type SuggestionBuilder = (
  teamName: string,
  elapsed: number,
  shots: number,
  rule: { maxElapsed: number; minShots: number },
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
    private readonly logger: JsonLogger,
  ) {}

  // ── API publique ─────────────────────────────────────────────

  /** Retourne toutes les suggestions calculées en temps réel. */
  async getAllSuggestions(): Promise<SmartSuggestion[]> {
    const [firstHalf, secondHalf] = await Promise.all([
      this.getFirstHalfSuggestions(),
      this.getSecondHalfSuggestions(),
    ]);
    return [...firstHalf, ...secondHalf];
  }

  /**
   * Évalue toutes les règles et persiste les résultats dans bet_recommendations.
   * Appelé automatiquement après chaque sync de données live.
   */
  async evaluateAndSave(): Promise<void> {
    const suggestions = await this.getAllSuggestions();
    if (!suggestions.length) return;

    // Nettoyer les anciennes suggestions auto pour les fixtures concernées
    const fixtureIds = [...new Set(suggestions.map((s) => s.fixtureId))];
    await this.recoRepo.delete({
      fixtureId:  In(fixtureIds),
      status:     'NEW',
      marketType: In(AUTO_MARKET_TYPES),
    });

    // Sauvegarder les nouvelles
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

    this.logger.log(
      { event: 'smart_suggestions_saved', count: suggestions.length },
      'SmartSuggestionsService',
    );
  }

  // ── Règles par mi-temps ──────────────────────────────────────

  private async getFirstHalfSuggestions(): Promise<SmartSuggestion[]> {
    const maxWindow = Math.max(...FIRST_HALF_RULES.map((r) => r.maxElapsed));
    const fixtures = await this.fixtureRepo
      .createQueryBuilder('f')
      .where('f.statusShort IN (:...statuses)', { statuses: FIRST_HALF_STATUSES })
      .andWhere('f.elapsed IS NOT NULL')
      .andWhere('f.elapsed >= 1')
      .andWhere('f.elapsed < :max', { max: maxWindow })
      .getMany();

    return this.evaluateFixtures({
      fixtures,
      rules: FIRST_HALF_RULES,
      halfSuffix: 'fh',
      buildPrimary: (teamName, elapsed, shots, rule) => ({
        marketType:       'Buts 1ère mi-temps',
        selection:        `${teamName} marque avant la mi-temps (+0.5)`,
        currentOdd:       1.75,
        minAcceptableOdd: 1.60,
        edgePct:          12.5,
        confidenceScore:  70,
        reasons: [
          `${shots} tirs en ${elapsed} min (seuil : ${rule.minShots} avant ${rule.maxElapsed}')`,
          'Forte pression offensive',
          'Probabilité accrue de marquer avant la mi-temps',
        ],
      }),
      buildSecondary: (teamName, elapsed, shots, rule) => ({
        marketType:       'Buts match',
        selection:        `${teamName} marque dans le match (+0.5)`,
        currentOdd:       1.45,
        minAcceptableOdd: 1.35,
        edgePct:          8.0,
        confidenceScore:  75,
        reasons: [
          `${shots} tirs en ${elapsed} min (seuil : ${rule.minShots} avant ${rule.maxElapsed}')`,
          'Domination offensive confirmée',
          'Haute probabilité de scorer sur 90 minutes',
        ],
      }),
    });
  }

  private async getSecondHalfSuggestions(): Promise<SmartSuggestion[]> {
    const fixtures = await this.fixtureRepo
      .createQueryBuilder('f')
      .where('f.statusShort IN (:...statuses)', { statuses: SECOND_HALF_STATUSES })
      .andWhere('f.elapsed IS NOT NULL')
      .andWhere('f.elapsed >= 45')
      .andWhere('f.elapsed < :max', { max: SECOND_HALF_RULE.maxElapsed })
      .getMany();

    return this.evaluateFixtures({
      fixtures,
      rules: [SECOND_HALF_RULE],
      halfSuffix: 'sh',
      buildPrimary: (teamName, elapsed, shots) => ({
        marketType:       'Buts 2ème mi-temps',
        selection:        `${teamName} marque en 2ème mi-temps (+0.5)`,
        currentOdd:       1.65,
        minAcceptableOdd: 1.50,
        edgePct:          10.0,
        confidenceScore:  72,
        reasons: [
          `${shots} tirs avant la ${elapsed}ème min (2ème mi-temps)`,
          'Pression offensive confirmée en 2ème mi-temps',
          'Fort potentiel de marquer avant la fin du match',
        ],
      }),
      buildSecondary: null,
    });
  }

  // ── Moteur d'évaluation partagé ──────────────────────────────

  private async evaluateFixtures(opts: {
    fixtures:        Fixture[];
    rules:           { maxElapsed: number; minShots: number }[];
    halfSuffix:      string;
    buildPrimary:    SuggestionBuilder;
    buildSecondary:  SuggestionBuilder | null;
  }): Promise<SmartSuggestion[]> {
    if (!opts.fixtures.length) return [];

    const fixtureIds  = opts.fixtures.map((f) => f.id);
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
        const shots   = this.extractTotalShots(snap.stats);
        const elapsed = fixture.elapsed ?? 0;
        if (shots === null) continue;

        const matchedRule = opts.rules.find(
          (r) => elapsed < r.maxElapsed && shots >= r.minShots,
        );
        if (!matchedRule) continue;

        const isHome   = teamId === fixture.homeTeamId;
        const teamName = (isHome ? fixture.homeTeamName : fixture.awayTeamName) ?? 'Équipe';
        const label    = `${fixture.homeTeamName ?? '?'} vs ${fixture.awayTeamName ?? '?'}`;
        const idBase   = `smart-${opts.halfSuffix}-${fixture.id}-${teamId}`;

        const primary = opts.buildPrimary(teamName, elapsed, shots, matchedRule);
        suggestions.push({
          id: `${idBase}-a`, fixtureId: fixture.id, fixtureLabel: label,
          ...primary, riskFlags: [], status: 'NEW',
          ruleName: 'shots-pressure', elapsed, shotsCount: shots,
        });

        if (opts.buildSecondary) {
          const secondary = opts.buildSecondary(teamName, elapsed, shots, matchedRule);
          suggestions.push({
            id: `${idBase}-b`, fixtureId: fixture.id, fixtureLabel: label,
            ...secondary, riskFlags: [], status: 'NEW',
            ruleName: 'shots-pressure', elapsed, shotsCount: shots,
          });
        }
      }
    }

    return suggestions;
  }

  // ── Utilitaires ──────────────────────────────────────────────

  private extractTotalShots(stats: Record<string, unknown>): number | null {
    const statistics = stats?.statistics;
    if (Array.isArray(statistics)) {
      for (const entry of statistics as Array<{ type?: string; value?: unknown }>) {
        if (entry.type === 'Total Shots') {
          const n = Number(entry.value);
          return Number.isNaN(n) ? null : n;
        }
      }
    }
    const flat = stats?.total_shots ?? stats?.shots;
    if (flat !== undefined) {
      const n = Number(flat);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }
}
