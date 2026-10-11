import { createHash } from 'node:crypto';
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
import { BacktestRun } from '../database/entities/backtest-run.entity';
import { BetResult } from '../database/entities/bet-result.entity';
import { Fixture } from '../database/entities/fixture.entity';
import { FixtureEvent } from '../database/entities/fixture-event.entity';
import { FixtureStatsSnapshot } from '../database/entities/fixture-stats-snapshot.entity';
import {
  resolveSettlement,
  FinalMatchState,
} from '../recommendations/rules/outcome-resolver';
import {
  evaluateRules,
  RuleEvaluationInput,
} from '../recommendations/rules/rules-evaluator';
import { ExecutableQuoteService } from '../odds/executable-quote.service';
import {
  DEFAULT_MAX_QUOTE_AGE_MS,
  quoteTargetForRuleMarket,
} from '../odds/odds.types';
import { applyStakingAndComputeKpis } from './kpis-calculator';
import {
  BacktestStrategy,
  DecidedBet,
  ReplayResult,
  SignalRecord,
  SignalStage,
} from './backtest.types';

const STAGE_RANK: Record<SignalStage, number> = {
  NO_QUOTE_AT_DECISION: 0,
  BELOW_MIN_ODD_AT_DECISION: 1,
  NO_QUOTE_AT_EXECUTION: 2,
  BELOW_MIN_ODD_AT_EXECUTION: 3,
  PLACED: 4,
};

/**
 * JSON canonique : clés triées récursivement, dates en ISO. Deux entrées égales
 * produisent la même chaîne, donc le même hash, quel que soit l'ordre d'insertion.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (record[key] !== undefined) acc[key] = canonicalize(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
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
    private readonly executableQuoteService: ExecutableQuoteService,
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
      const { bets: decided } = await this.replayDetailed(
        strategy,
        resolvedWindow,
      );
      const { staked, kpis } = applyStakingAndComputeKpis(decided, strategy);

      const placed = staked.filter((b) => b.placed);
      if (placed.length) {
        await this.betRepo.insert(
          placed.map((b) => ({
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
    return (await this.replayDetailed(strategy, window)).bets;
  }

  /**
   * Rejeu complet : paris décidés, sort de chaque signal (absences de cote
   * comprises) et empreinte des données lues. Toutes les lectures sont groupées
   * (une requête par table, jamais par fixture).
   */
  async replayDetailed(
    strategy: BacktestStrategy,
    window: { start: Date; end: Date },
  ): Promise<ReplayResult> {
    const snapshots = await this.statsRepo
      .createQueryBuilder('s')
      .where('s.snapshotAt BETWEEN :start AND :end', window)
      .orderBy('s.snapshotAt', 'ASC')
      .getMany();
    // Départage stable des snapshots simultanés : l'ordre de rejeu (donc le hash) ne
    // dépend pas de l'ordre de retour du SGBD.
    snapshots.sort(
      (a, b) =>
        a.snapshotAt.getTime() - b.snapshotAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    if (!snapshots.length) {
      return { bets: [], signals: [], datasetHash: sha256Canonical([]) };
    }

    const fixtureIds = [...new Set(snapshots.map((s) => s.fixtureId))];
    const fixtures = await this.fixtureRepo.findBy({ id: In(fixtureIds) });
    const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

    const config = strategy.entryRules;
    const latencyMs = strategy.odds.executionLatencyMs;
    const maxQuoteAgeMs =
      strategy.odds.maxQuoteAgeMs ?? DEFAULT_MAX_QUOTE_AGE_MS;
    const bookmakerKey = strategy.odds.bookmakerKey;
    const providerFixtureIds = fixtures.map((fixture) =>
      String(fixture.providerFixtureId),
    );
    const quoteCandidates = await this.executableQuoteService.loadCandidates({
      providerFixtureIds,
      receivedFrom: new Date(window.start.getTime() - maxQuoteAgeMs),
      receivedTo: new Date(window.end.getTime() + latencyMs),
    });

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
    const signalByKey = new Map<string, SignalRecord>();
    const recordSignal = (
      key: string,
      fixtureId: string,
      marketType: string,
      at: Date,
      stage: SignalStage,
    ) => {
      const existing = signalByKey.get(key);
      if (!existing) {
        signalByKey.set(key, {
          fixtureId,
          marketType,
          firstSignalAt: at,
          stage,
        });
      } else if (STAGE_RANK[stage] > STAGE_RANK[existing.stage]) {
        existing.stage = stage;
      }
    };

    for (const [fixtureId, fixtureSnaps] of snapshotsByFixture) {
      const fixture = fixtureById.get(fixtureId);
      if (!fixture) continue;
      if (fixture.homeTeamId === null || fixture.awayTeamId === null) continue;

      const finalState = this.buildFinalState(fixture);
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
        };

        for (const match of evaluateRules(input, config)) {
          if (!strategy.markets.includes(match.marketType)) continue;
          if (match.edgePct < strategy.minEdgePct) continue;
          if (match.confidenceScore < strategy.minConfidence) continue;

          const key = `${fixtureId}|${match.teamId}|${match.marketType}`;
          if (placedKeys.has(key)) continue;

          const baseTarget = quoteTargetForRuleMarket(
            String(fixture.providerFixtureId),
            match.marketType,
            match.isHomeTeam,
          );
          if (!baseTarget) continue;
          const target = bookmakerKey
            ? { ...baseTarget, bookmakerKey }
            : baseTarget;
          const signal = (stage: SignalStage) =>
            recordSignal(key, fixtureId, match.marketType, tickAt!, stage);

          const decisionQuote = this.executableQuoteService.selectLatest(
            quoteCandidates,
            {
              target,
              at: tickAt!,
              maxQuoteAgeMs,
            },
          );
          if (!decisionQuote) {
            signal('NO_QUOTE_AT_DECISION');
            continue;
          }
          if (decisionQuote.oddValue < match.minAcceptableOdd) {
            signal('BELOW_MIN_ODD_AT_DECISION');
            continue;
          }

          const executionQuote = this.executableQuoteService.selectLatest(
            quoteCandidates,
            {
              target: {
                ...target,
                providerKey: decisionQuote.providerKey,
                bookmakerKey: decisionQuote.bookmakerKey,
              },
              at: new Date(tickAt!.getTime() + latencyMs),
              maxQuoteAgeMs,
            },
          );
          if (!executionQuote) {
            signal('NO_QUOTE_AT_EXECUTION');
            continue;
          }
          if (executionQuote.oddValue < match.minAcceptableOdd) {
            signal('BELOW_MIN_ODD_AT_EXECUTION');
            continue;
          }
          placedKeys.add(key);
          signal('PLACED');

          // Même règle de règlement que la simulation : un match annulé rembourse (VOID).
          const outcome = resolveSettlement(
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
            oddAtDecision: executionQuote.oddValue,
            quotedOdd: decisionQuote.oddValue,
            oddSource: 'ODDS_SNAPSHOT',
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

    const datasetHash = sha256Canonical({
      snapshots: snapshots.map((snap) => [
        snap.id,
        snap.fixtureId,
        snap.teamId,
        snap.elapsed,
        snap.snapshotAt,
        snap.stats,
      ]),
      fixtures: [...fixtures]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((fixture) => [
          fixture.id,
          String(fixture.providerFixtureId),
          fixture.homeTeamId,
          fixture.awayTeamId,
          this.buildFinalState(fixture),
        ]),
      goals: goals
        .map((goal) => [goal.fixtureId, goal.teamId, goal.minute])
        .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
      quotes: [...quoteCandidates]
        .sort((a, b) => a.snapshotId.localeCompare(b.snapshotId))
        .map((quote) => [
          quote.snapshotId,
          quote.providerKey,
          quote.bookmakerKey,
          quote.marketKey,
          quote.selectionKey,
          quote.oddValue,
          quote.observedAt,
          quote.receivedAt,
        ]),
    });

    const signals = [...signalByKey.values()].sort(
      (a, b) =>
        a.firstSignalAt.getTime() - b.firstSignalAt.getTime() ||
        a.fixtureId.localeCompare(b.fixtureId) ||
        a.marketType.localeCompare(b.marketType),
    );
    return { bets, signals, datasetHash };
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
}
