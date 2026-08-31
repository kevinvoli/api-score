import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import {
  extractHtScore,
  extractTotalShots,
  getStatValue,
  computePressureIndex,
} from '../common/utils/stats.utils';
import { ApiFootballPayload } from '../database/entities/api-football-payload.entity';
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import {
  resolveOutcome,
  FinalMatchState,
} from '../recommendations/rules/outcome-resolver';
import {
  evaluateRules,
  RuleEvaluationInput,
} from '../recommendations/rules/rules-evaluator';
import { applyStakingAndComputeKpis } from './kpis-calculator';
import { BacktestStrategy, DecidedBet, OddsSource } from './backtest.types';

interface OddsPayloadTick {
  at: Date;
  /** entrées live_odds du payload pour un match donné */
  entries: Record<string, unknown>[];
}

@Injectable()
export class BacktestEngineService {
  constructor(
    @InjectRepository(BacktestRun)
    private readonly runRepo: Repository<BacktestRun>,
    @InjectRepository(BetResult)
    private readonly betRepo: Repository<BetResult>,
    @InjectRepository(Fixture)
    private readonly fixtureRepo: Repository<Fixture>,
    @InjectRepository(FixtureStatsSnapshot)
    private readonly statsRepo: Repository<FixtureStatsSnapshot>,
    @InjectRepository(FixtureEvent)
    private readonly eventRepo: Repository<FixtureEvent>,
    @InjectRepository(ApiFootballPayload)
    private readonly payloadRepo: Repository<ApiFootballPayload>,
    private readonly logger: JsonLogger,
  ) {}

  async run(
    name: string,
    strategy: BacktestStrategy,
    window?: { start: Date; end: Date },
  ): Promise<BacktestRun> {
    const resolvedWindow = window ?? (await this.defaultWindow());
    const run = await this.runRepo.save(
      this.runRepo.create({
        name,
        strategy: strategy as unknown as Record<string, unknown>,
        windowStart: resolvedWindow.start,
        windowEnd: resolvedWindow.end,
        status: 'RUNNING',
      }),
    );

    try {
      const decided = await this.replay(strategy, resolvedWindow);
      const { staked, kpis } = applyStakingAndComputeKpis(decided, strategy);

      if (staked.length) {
        await this.betRepo.insert(
          staked.map((b) => ({
            runId: run.id,
            fixtureId: b.fixtureId,
            providerFixtureId: b.providerFixtureId,
            marketType: b.marketType,
            selection: b.selection,
            ruleName: b.ruleName,
            teamId: b.teamId,
            isHomeTeam: b.isHomeTeam,
            decisionAt: b.decisionAt,
            elapsedAtDecision: b.elapsedAtDecision,
            oddAtDecision: b.oddAtDecision,
            oddSource: b.oddSource,
            edgePct: b.edgePct,
            confidenceScore: b.confidenceScore,
            stake: b.stake,
            outcome: b.outcome,
            profit: b.profit,
            resolvedAt: b.outcome === 'NO_RESULT' ? null : new Date(),
          })),
        );
      }

      run.status = 'COMPLETED';
      run.kpis = kpis as unknown as Record<string, unknown>;
      run.totalBets = kpis.betCount;
      run.wonBets = kpis.wonBets;
      run.lostBets = kpis.lostBets;
      run.noResultBets = kpis.noResultBets;
      run.completedAt = new Date();
      await this.runRepo.save(run);

      this.logger.log(
        {
          event: 'backtest_completed',
          runId: run.id,
          bets: kpis.betCount,
          hitRate: kpis.hitRate,
          roiPct: kpis.roiPct,
        },
        'BacktestEngineService',
      );
      return run;
    } catch (error) {
      run.status = 'FAILED';
      run.error = String(error).slice(0, 500);
      run.completedAt = new Date();
      await this.runRepo.save(run);
      this.logger.error(
        { event: 'backtest_failed', runId: run.id },
        error instanceof Error ? error.stack : undefined,
        'BacktestEngineService',
      );
      throw error;
    }
  }

  private async defaultWindow(): Promise<{ start: Date; end: Date }> {
    const row = await this.statsRepo
      .createQueryBuilder('s')
      .select('MIN(s.snapshotAt)', 'min')
      .addSelect('MAX(s.snapshotAt)', 'max')
      .getRawOne<{ min: Date | null; max: Date | null }>();
    const now = new Date();
    return {
      start: row?.min ? new Date(row.min) : now,
      end: row?.max ? new Date(row.max) : now,
    };
  }

  /**
   * Rejeu chronologique sans look-ahead : à chaque tick (snapshotAt), la
   * décision ne lit que les tirs connus à ce tick, l'elapsed du tick et une
   * cote disponible au plus tard à T + latence. La résolution, elle, est
   * post-hoc sur l'état FINAL du match (légitime : elle simule le règlement
   * du pari, pas la décision).
   */
  private async replay(
    strategy: BacktestStrategy,
    window: { start: Date; end: Date },
  ): Promise<DecidedBet[]> {
    const snapshots = await this.statsRepo
      .createQueryBuilder('s')
      .where('s.snapshotAt BETWEEN :start AND :end', window)
      .orderBy('s.snapshotAt', 'ASC')
      .getMany();
    if (!snapshots.length) return [];

    const fixtureIds = [...new Set(snapshots.map((s) => s.fixtureId))];
    const fixtures = await this.fixtureRepo.findBy({ id: In(fixtureIds) });
    const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

    const oddsByMatch = await this.loadOddsPayloads(window);
    const config = strategy.entryRules;
    const latencyMs = strategy.odds.executionLatencyMs;

    const snapshotsByFixture = new Map<string, FixtureStatsSnapshot[]>();
    for (const snap of snapshots) {
      const list = snapshotsByFixture.get(snap.fixtureId) ?? [];
      list.push(snap);
      snapshotsByFixture.set(snap.fixtureId, list);
    }

    // Buts (minute) pour reconstruire le score courant à chaque tick (LOT 3.4).
    const goals = await this.eventRepo.find({
      where: { fixtureId: In(fixtureIds), eventType: 'Goal' },
      select: ['fixtureId', 'teamId', 'minute'],
    });
    const goalsByFixture = new Map<string, FixtureEvent[]>();
    for (const goal of goals) {
      const list = goalsByFixture.get(goal.fixtureId) ?? [];
      list.push(goal);
      goalsByFixture.set(goal.fixtureId, list);
    }

    const bets: DecidedBet[] = [];

    for (const [fixtureId, fixtureSnaps] of snapshotsByFixture) {
      const fixture = fixtureById.get(fixtureId);
      if (!fixture) continue;
      if (fixture.homeTeamId === null || fixture.awayTeamId === null) continue;

      const finalState = this.buildFinalState(fixture);
      const matchOdds =
        oddsByMatch.get(String(fixture.providerFixtureId)) ?? [];
      const placedKeys = new Set<string>();
      const fixtureGoals = goalsByFixture.get(fixtureId) ?? [];

      /** Score de chaque équipe aux buts inscrits jusqu'à `elapsed` inclus. */
      const scoreAt = (elapsed: number): { home: number; away: number } => {
        let home = 0;
        let away = 0;
        for (const g of fixtureGoals) {
          if (g.minute === null || g.minute > elapsed) continue;
          if (g.teamId === fixture.homeTeamId) home += 1;
          else if (g.teamId === fixture.awayTeamId) away += 1;
        }
        return { home, away };
      };

      // État courant reconstruit au fil des ticks (un accumulateur par signal, LOT 3)
      const shotsByTeam = new Map<number, number>();
      const onTargetByTeam = new Map<number, number>();
      const pressureByTeam = new Map<number, number>();
      const htShotsByTeam = new Map<number, number>();
      const htOnTargetByTeam = new Map<number, number>();
      const htPressureByTeam = new Map<number, number>();

      let tickAt: Date | null = null;
      let tickElapsed: number | null = null;

      const evaluateTick = () => {
        if (tickAt === null || tickElapsed === null) return;
        const score = scoreAt(tickElapsed);
        const input: RuleEvaluationInput = {
          elapsed: tickElapsed,
          // Convention apifootball du live : tout match en cours est 'LIVE' ;
          // le fenêtrage 1MT/2MT est porté par elapsed dans l'évaluateur.
          statusShort: 'LIVE',
          home: {
            teamId: fixture.homeTeamId!,
            teamName: fixture.homeTeamName ?? 'Équipe',
            totalShots: shotsByTeam.get(fixture.homeTeamId!) ?? null,
            shotsOnTarget: onTargetByTeam.get(fixture.homeTeamId!) ?? null,
            pressureIndex: pressureByTeam.get(fixture.homeTeamId!) ?? null,
          },
          away: {
            teamId: fixture.awayTeamId!,
            teamName: fixture.awayTeamName ?? 'Équipe',
            totalShots: shotsByTeam.get(fixture.awayTeamId!) ?? null,
            shotsOnTarget: onTargetByTeam.get(fixture.awayTeamId!) ?? null,
            pressureIndex: pressureByTeam.get(fixture.awayTeamId!) ?? null,
          },
          htShots: {
            home: htShotsByTeam.get(fixture.homeTeamId!) ?? 0,
            away: htShotsByTeam.get(fixture.awayTeamId!) ?? 0,
          },
          htOnTarget: {
            home: htOnTargetByTeam.get(fixture.homeTeamId!) ?? 0,
            away: htOnTargetByTeam.get(fixture.awayTeamId!) ?? 0,
          },
          htPressure: {
            home: htPressureByTeam.get(fixture.homeTeamId!) ?? 0,
            away: htPressureByTeam.get(fixture.awayTeamId!) ?? 0,
          },
          scoreHome: score.home,
          scoreAway: score.away,
          liveOdd: null,
        };

        for (const match of evaluateRules(input, config)) {
          if (!strategy.markets.includes(match.marketType)) continue;
          if (match.edgePct < strategy.minEdgePct) continue;
          if (match.confidenceScore < strategy.minConfidence) continue;

          const key = `${fixtureId}|${match.teamId}|${match.marketType}`;
          if (placedKeys.has(key)) continue;
          placedKeys.add(key);

          const sourced = this.resolveOddAtDecision(
            strategy,
            matchOdds,
            new Date(tickAt!.getTime() + latencyMs),
            match.marketType,
            match.isHomeTeam,
          );

          const outcome = resolveOutcome(
            { marketType: match.marketType, isHomeTeam: match.isHomeTeam },
            finalState,
          );

          bets.push({
            fixtureId,
            providerFixtureId: String(fixture.providerFixtureId),
            marketType: match.marketType,
            selection: match.selection,
            ruleName: match.ruleName,
            teamId: match.teamId,
            isHomeTeam: match.isHomeTeam,
            decisionAt: tickAt!,
            elapsedAtDecision: tickElapsed,
            oddAtDecision: sourced?.odd ?? match.currentOdd,
            oddSource: sourced?.source ?? 'STRATEGY_DEFAULT',
            edgePct: match.edgePct,
            confidenceScore: match.confidenceScore,
            outcome: outcome ?? 'NO_RESULT',
          });
        }
      };

      for (const snap of fixtureSnaps) {
        const at = snap.snapshotAt.getTime();
        if (tickAt !== null && at !== tickAt.getTime()) {
          evaluateTick();
        }
        tickAt = snap.snapshotAt;
        if (snap.elapsed !== null) tickElapsed = snap.elapsed;
        if (snap.teamId) {
          const isHt = (snap.elapsed ?? 99) <= 45;
          const shots = extractTotalShots(snap.stats);
          if (shots !== null) {
            shotsByTeam.set(snap.teamId, shots);
            if (isHt) htShotsByTeam.set(snap.teamId, shots);
          }
          const onTarget = getStatValue(snap.stats, [
            'On Target',
            'Shots on Goal',
          ]);
          onTargetByTeam.set(snap.teamId, onTarget);
          if (isHt) htOnTargetByTeam.set(snap.teamId, onTarget);

          const pressure = computePressureIndex(snap.stats);
          pressureByTeam.set(snap.teamId, pressure);
          if (isHt) htPressureByTeam.set(snap.teamId, pressure);
        }
      }
      evaluateTick();
    }

    return bets;
  }

  private buildFinalState(fixture: Fixture): FinalMatchState {
    const raw = fixture.raw as Record<string, unknown> | null;
    return {
      statusShort: fixture.statusShort ?? '',
      scoreHome: fixture.scoreHome,
      scoreAway: fixture.scoreAway,
      htScoreHome: extractHtScore(raw, true),
      htScoreAway: extractHtScore(raw, false),
    };
  }

  /** Payloads live_odds_all de la fenêtre, indexés par match_id provider. */
  private async loadOddsPayloads(window: {
    start: Date;
    end: Date;
  }): Promise<Map<string, OddsPayloadTick[]>> {
    const payloads = await this.payloadRepo
      .createQueryBuilder('p')
      .where('p.endpoint = :ep', { ep: 'live_odds_all' })
      .andWhere('p.createdAt BETWEEN :start AND :end', window)
      .orderBy('p.createdAt', 'ASC')
      .getMany();

    const byMatch = new Map<string, OddsPayloadTick[]>();
    for (const p of payloads) {
      const arr = Array.isArray(p.payload)
        ? p.payload
        : Object.values(p.payload ?? {});
      for (const entry of arr as Record<string, unknown>[]) {
        const matchId = String(entry?.['match_id'] ?? '');
        if (!matchId) continue;
        const lo = entry['live_odds'];
        const entries = Array.isArray(lo)
          ? (lo as Record<string, unknown>[])
          : [];
        if (!entries.length) continue;
        const list = byMatch.get(matchId) ?? [];
        list.push({ at: p.createdAt, entries });
        byMatch.set(matchId, list);
      }
    }
    return byMatch;
  }

  /**
   * Cote disponible au plus tard à `deadline` (T + latence), selon la chaîne
   * de sources de la stratégie. ODDS_SNAPSHOT ne couvre pas encore les
   * marchés « équipe marque » (1X2/OU/BTTS seulement) → passe au suivant.
   */
  private resolveOddAtDecision(
    strategy: BacktestStrategy,
    matchOdds: OddsPayloadTick[],
    deadline: Date,
    marketType: string,
    isHomeTeam: boolean,
  ): { odd: number; source: OddsSource } | null {
    for (const source of strategy.odds.source) {
      if (source === 'LIVE_PAYLOAD') {
        const tick = [...matchOdds]
          .reverse()
          .find((t) => t.at.getTime() <= deadline.getTime());
        if (!tick) continue;
        const odd = extractTeamScoresOdd(tick.entries, marketType, isHomeTeam);
        if (odd !== null) return { odd, source };
      }
      if (source === 'STRATEGY_DEFAULT') {
        return null; // le défaut de la config est déjà porté par RuleMatch.currentOdd
      }
    }
    return null;
  }
}

/**
 * Extrait la cote « l'équipe marque » depuis les entrées live_odds apifootball
 * ({ odd_name, type, value, handicap, suspended }) pour le marché demandé.
 */
export function extractTeamScoresOdd(
  entries: Record<string, unknown>[],
  marketType: string,
  isHomeTeam: boolean,
): number | null {
  const side = isHomeTeam ? 'Home' : 'Away';
  const wanted =
    marketType === 'Buts 1ère mi-temps'
      ? `${side} Team Score a Goal (1st Half)`
      : marketType === 'Buts 2ème mi-temps'
        ? `${side} Team Score a Goal (2nd Half)`
        : marketType === 'Buts match'
          ? `${side} Team Goals`
          : null;
  if (!wanted) return null;

  for (const e of entries) {
    if (String(e['suspended'] ?? '') === 'Yes') continue;
    if (String(e['odd_name'] ?? '') !== wanted) continue;
    const type = String(e['type'] ?? '');
    if (marketType === 'Buts match') {
      // "Home Team Goals" : Over 0.5 = l'équipe marque au moins un but
      if (type !== 'Over' || String(e['handicap'] ?? '') !== '0.5') continue;
    } else if (type !== 'Yes') {
      continue;
    }
    const value = Number(e['value']);
    if (Number.isFinite(value) && value > 1) return value;
  }
  return null;
}
