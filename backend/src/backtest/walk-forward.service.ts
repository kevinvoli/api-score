import {
  BadRequestException,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JsonLogger } from '../common/json.logger';
import {
  WalkForwardFold,
  WalkForwardIneligibility,
} from '../database/entities/walk-forward-fold.entity';
import { WalkForwardRun } from '../database/entities/walk-forward-run.entity';
import {
  BacktestEngineService,
  sha256Canonical,
} from './backtest-engine.service';
import {
  BacktestKpis,
  BacktestStrategy,
  DecidedBet,
  SignalAccounting,
  SignalRecord,
} from './backtest.types';
import {
  applyStakingAndComputeKpis,
  summarizeSignals,
} from './kpis-calculator';

const DAY_MS = 86_400_000;

/** Couverture de cote exécutable minimale d'une fenêtre de test (seuil initial de G2). */
export const MIN_FOLD_ODDS_COVERAGE_PCT = 95;
/** Borne le nombre de folds pour qu'un paramétrage absurde ne sature pas le serveur. */
export const MAX_FOLDS = 200;

export interface WalkForwardParams {
  strategyVersion: string;
  strategy: BacktestStrategy;
  trainWindowDays: number;
  validationWindowDays: number;
  testWindowDays: number;
  stepDays: number;
  from: Date;
  to: Date;
  bookmakerKey?: string;
  maxQuoteAgeMs: number;
  executionLatencyMs: number;
}

/** Fenêtres semi-ouvertes [from, to[ : un instant n'appartient qu'à une fenêtre. */
export interface FoldWindow {
  foldIndex: number;
  trainFrom: Date;
  trainTo: Date;
  validationFrom: Date;
  validationTo: Date;
  testFrom: Date;
  testTo: Date;
  /** false quand la fenêtre de test dépasse la fin de la plage de données. */
  complete: boolean;
}

export interface WindowMetrics {
  kpis: BacktestKpis;
  signals: SignalAccounting;
}

export interface FoldMetrics {
  train: WindowMetrics;
  validation: WindowMetrics;
  test: WindowMetrics;
}

export interface WalkForwardSummary {
  folds: number;
  eligibleFolds: number;
  ineligibleByReason: Partial<Record<WalkForwardIneligibility, number>>;
  /** Fenêtres de test des folds éligibles, enchaînées chronologiquement sur une seule bankroll. */
  test: WindowMetrics;
}

interface FrozenConfig {
  strategyVersion: string;
  from: string;
  to: string;
  trainWindowDays: number;
  validationWindowDays: number;
  testWindowDays: number;
  stepDays: number;
  odds: {
    bookmakerKey: string | null;
    maxQuoteAgeMs: number;
    executionLatencyMs: number;
  };
  minFoldOddsCoveragePct: number;
  folds: Array<{
    foldIndex: number;
    trainFrom: string;
    trainTo: string;
    validationFrom: string;
    validationTo: string;
    testFrom: string;
    testTo: string;
    complete: boolean;
  }>;
}

/**
 * Découpe [from, to[ en folds glissants. Les fenêtres de test ne se chevauchent
 * jamais (stepDays >= testWindowDays). Le premier fold dont la fenêtre de test
 * déborde est conservé comme incomplet, puis la génération s'arrête.
 */
export function buildFolds(params: {
  from: Date;
  to: Date;
  trainWindowDays: number;
  validationWindowDays: number;
  testWindowDays: number;
  stepDays: number;
}): FoldWindow[] {
  const fromMs = params.from.getTime();
  const toMs = params.to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    throw new BadRequestException('La plage from/to est invalide');
  }
  if (params.stepDays < params.testWindowDays) {
    throw new BadRequestException(
      'stepDays doit être >= testWindowDays : les fenêtres de test ne doivent pas se chevaucher',
    );
  }

  const folds: FoldWindow[] = [];
  for (let index = 0; ; index += 1) {
    const trainFrom = fromMs + index * params.stepDays * DAY_MS;
    const trainTo = trainFrom + params.trainWindowDays * DAY_MS;
    const validationTo = trainTo + params.validationWindowDays * DAY_MS;
    const testTo = validationTo + params.testWindowDays * DAY_MS;
    if (validationTo >= toMs) break;
    if (folds.length >= MAX_FOLDS) {
      throw new BadRequestException(
        `Plus de ${MAX_FOLDS} folds : élargir stepDays ou réduire la plage`,
      );
    }

    const complete = testTo <= toMs;
    folds.push({
      foldIndex: index,
      trainFrom: new Date(trainFrom),
      trainTo: new Date(trainTo),
      validationFrom: new Date(trainTo),
      validationTo: new Date(validationTo),
      testFrom: new Date(validationTo),
      testTo: new Date(testTo),
      complete,
    });
    if (!complete) break;
  }
  return folds;
}

/** Nom du verrou MySQL tenu pendant l'exécution d'un run (≤ 64 caractères). */
export const walkForwardLockName = (runId: string): string =>
  `api_score:wf:${runId}`;

/**
 * Un run PENDING est exécuté quelques millisecondes après sa création ; au-delà de ce délai,
 * un run sans verrou n'a plus de processus pour le faire avancer.
 */
export const WALK_FORWARD_ORPHAN_GRACE_MS = 60_000;

export const WALK_FORWARD_ORPHAN_ERROR =
  'Interrompu : le processus qui exécutait ce run s’est arrêté. Relancer le walk-forward.';

@Injectable()
export class WalkForwardService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(WalkForwardRun)
    private readonly runRepo: Repository<WalkForwardRun>,
    @InjectRepository(WalkForwardFold)
    private readonly foldRepo: Repository<WalkForwardFold>,
    private readonly engine: BacktestEngineService,
    private readonly logger: JsonLogger,
    private readonly dataSource: DataSource,
  ) {}

  /** Au démarrage : un run resté PENDING/RUNNING sans exécutant passe en FAILED. Ne bloque jamais le démarrage. */
  async onApplicationBootstrap(): Promise<void> {
    await this.failOrphanedRuns().catch((error: unknown) => {
      this.logger.error(
        { event: 'walk_forward_orphan_check_failed' },
        error instanceof Error ? error.stack : undefined,
        'WalkForwardService',
      );
    });
  }

  /**
   * L'exécution est en mémoire : un redémarrage la perd sans changer le statut. Chaque exécution
   * tient un verrou nommé MySQL que le serveur libère si la connexion meurt ; un run actif dont le
   * verrou est libre n'a donc plus d'exécutant, même avec plusieurs instances du backend. Une seule
   * requête détecte et clôt ces runs.
   */
  async failOrphanedRuns(now: Date = new Date()): Promise<number> {
    const result = (await this.dataSource.query(
      `UPDATE walk_forward_runs
          SET status = 'FAILED', error = ?, completed_at = ?
        WHERE status IN ('PENDING', 'RUNNING')
          AND created_at < ?
          AND IS_USED_LOCK(CONCAT('api_score:wf:', id)) IS NULL`,
      [
        WALK_FORWARD_ORPHAN_ERROR,
        now,
        new Date(now.getTime() - WALK_FORWARD_ORPHAN_GRACE_MS),
      ],
    )) as { affectedRows?: number };
    const failed = result?.affectedRows ?? 0;
    if (failed > 0) {
      this.logger.log(
        { event: 'walk_forward_orphans_failed', count: failed },
        'WalkForwardService',
      );
    }
    return failed;
  }

  /** Verrou tenu sur une connexion dédiée pendant tout le rejeu ; `null` si un autre exécutant le tient. */
  private async acquireLease(
    runId: string,
  ): Promise<{ release: () => Promise<void> } | null> {
    const name = walkForwardLockName(runId);
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      const [{ acquired }] = (await runner.query(
        'SELECT GET_LOCK(?, 0) AS acquired',
        [name],
      )) as Array<{ acquired: number | string | null }>;
      if (Number(acquired) !== 1) {
        await runner.release();
        return null;
      }
    } catch (error) {
      await runner.release().catch(() => undefined);
      throw error;
    }
    return {
      release: async () => {
        await runner
          .query('SELECT RELEASE_LOCK(?)', [name])
          .catch(() => undefined);
        await runner.release().catch(() => undefined);
      },
    };
  }

  /**
   * Fige stratégie, fenêtres et paramètres de cote, persiste le run `PENDING`
   * puis lance l'exécution en arrière-plan. L'exécution relit la copie figée en
   * base : modifier l'objet fourni après l'appel n'a aucun effet.
   */
  async start(
    params: WalkForwardParams,
    requestedByUserId: string | null,
  ): Promise<{ runId: string }> {
    const folds = buildFolds(params);
    if (!folds.length) {
      throw new BadRequestException(
        'La plage ne contient aucune fenêtre de test après entraînement et validation',
      );
    }

    const strategy = this.freezeStrategy(params);
    const config = this.freezeConfig(params, folds);
    const configHash = sha256Canonical({ strategy, config });

    const run = await this.runRepo.save(
      this.runRepo.create({
        strategyVersion: params.strategyVersion,
        strategySnapshot: strategy as unknown as Record<string, unknown>,
        config: config as unknown as Record<string, unknown>,
        configHash,
        datasetHash: null,
        resultHash: null,
        status: 'PENDING',
        rangeFrom: params.from,
        rangeTo: params.to,
        summary: null,
        error: null,
        requestedByUserId,
        startedAt: null,
        completedAt: null,
      }),
    );

    setImmediate(() => {
      this.execute(run.id).catch(() => undefined);
    });
    return { runId: run.id };
  }

  /**
   * Exécute un run `PENDING` une seule fois : la transition PENDING → RUNNING est
   * conditionnelle, un second appel concurrent ne fait rien.
   */
  async execute(runId: string): Promise<void> {
    const lease = await this.acquireLease(runId);
    if (!lease) return;
    try {
      await this.executeLeased(runId);
    } finally {
      await lease.release();
    }
  }

  private async executeLeased(runId: string): Promise<void> {
    const claimed = await this.runRepo.update(
      { id: runId, status: 'PENDING' },
      { status: 'RUNNING', startedAt: new Date() },
    );
    if (!claimed.affected) return;

    const run = await this.runRepo.findOneByOrFail({ id: runId });
    try {
      const strategy = run.strategySnapshot as unknown as BacktestStrategy;
      const config = run.config as unknown as FrozenConfig;
      const replay = await this.engine.replayDetailed(strategy, {
        start: new Date(config.from),
        end: new Date(config.to),
      });

      const foldRows: Array<Partial<WalkForwardFold>> = [];
      const eligibleTestBets: DecidedBet[] = [];
      const eligibleTestSignals: SignalRecord[] = [];
      const ineligibleByReason: WalkForwardSummary['ineligibleByReason'] = {};
      const foldResults: unknown[] = [];

      for (const fold of config.folds) {
        const window = (from: string, to: string) =>
          this.measureWindow(replay.bets, replay.signals, strategy, from, to);
        const metrics: FoldMetrics = {
          train: window(fold.trainFrom, fold.trainTo),
          validation: window(fold.validationFrom, fold.validationTo),
          test: window(fold.testFrom, fold.testTo),
        };
        const reason = this.ineligibility(
          fold.complete,
          metrics.test.signals,
          config.minFoldOddsCoveragePct,
        );

        if (reason) {
          ineligibleByReason[reason] = (ineligibleByReason[reason] ?? 0) + 1;
        } else {
          eligibleTestBets.push(
            ...this.inWindow(
              replay.bets,
              (b) => b.decisionAt,
              fold.testFrom,
              fold.testTo,
            ),
          );
          eligibleTestSignals.push(
            ...this.inWindow(
              replay.signals,
              (s) => s.firstSignalAt,
              fold.testFrom,
              fold.testTo,
            ),
          );
        }

        foldResults.push({ foldIndex: fold.foldIndex, reason, metrics });
        foldRows.push({
          runId,
          foldIndex: fold.foldIndex,
          trainFrom: new Date(fold.trainFrom),
          trainTo: new Date(fold.trainTo),
          validationFrom: new Date(fold.validationFrom),
          validationTo: new Date(fold.validationTo),
          testFrom: new Date(fold.testFrom),
          testTo: new Date(fold.testTo),
          status: reason ? 'INELIGIBLE' : 'COMPLETED',
          ineligibilityReason: reason,
          metrics: metrics as unknown as Record<string, unknown>,
        });
      }

      const summary: WalkForwardSummary = {
        folds: config.folds.length,
        eligibleFolds: config.folds.length - foldRowsIneligible(foldRows),
        ineligibleByReason,
        test: {
          kpis: applyStakingAndComputeKpis(eligibleTestBets, strategy).kpis,
          signals: summarizeSignals(eligibleTestSignals),
        },
      };
      const resultHash = sha256Canonical({ folds: foldResults, summary });

      if (foldRows.length) await this.foldRepo.insert(foldRows);
      await this.runRepo.update(
        { id: runId },
        {
          status: 'COMPLETED',
          datasetHash: replay.datasetHash,
          resultHash,
          summary: summary as unknown as Record<string, unknown>,
          completedAt: new Date(),
        },
      );
      this.logger.log(
        {
          event: 'walk_forward_completed',
          runId,
          folds: summary.folds,
          eligibleFolds: summary.eligibleFolds,
          resultHash,
        },
        'WalkForwardService',
      );
    } catch (error) {
      await this.runRepo.update(
        { id: runId },
        {
          status: 'FAILED',
          error: String(error).slice(0, 500),
          completedAt: new Date(),
        },
      );
      this.logger.error(
        { event: 'walk_forward_failed', runId },
        error instanceof Error ? error.stack : undefined,
        'WalkForwardService',
      );
      throw error;
    }
  }

  /** Runs les plus récents pour la console : sans folds ni stratégie figée (volumineux). */
  listRuns(limit = 20): Promise<WalkForwardRun[]> {
    return this.runRepo.find({
      select: {
        id: true,
        strategyVersion: true,
        status: true,
        rangeFrom: true,
        rangeTo: true,
        summary: true,
        error: true,
        configHash: true,
        datasetHash: true,
        resultHash: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async getRun(
    runId: string,
  ): Promise<(WalkForwardRun & { folds: WalkForwardFold[] }) | null> {
    const run = await this.runRepo.findOneBy({ id: runId });
    if (!run) return null;
    const folds = await this.foldRepo.find({
      where: { runId },
      order: { foldIndex: 'ASC' },
    });
    return Object.assign(run, { folds });
  }

  private freezeStrategy(params: WalkForwardParams): BacktestStrategy {
    const copy = JSON.parse(
      JSON.stringify(params.strategy),
    ) as BacktestStrategy;
    copy.version = params.strategyVersion;
    copy.odds = {
      ...copy.odds,
      executionLatencyMs: params.executionLatencyMs,
      maxQuoteAgeMs: params.maxQuoteAgeMs,
    };
    if (params.bookmakerKey) copy.odds.bookmakerKey = params.bookmakerKey;
    else delete copy.odds.bookmakerKey;
    return copy;
  }

  private freezeConfig(
    params: WalkForwardParams,
    folds: FoldWindow[],
  ): FrozenConfig {
    return {
      strategyVersion: params.strategyVersion,
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      trainWindowDays: params.trainWindowDays,
      validationWindowDays: params.validationWindowDays,
      testWindowDays: params.testWindowDays,
      stepDays: params.stepDays,
      odds: {
        bookmakerKey: params.bookmakerKey ?? null,
        maxQuoteAgeMs: params.maxQuoteAgeMs,
        executionLatencyMs: params.executionLatencyMs,
      },
      minFoldOddsCoveragePct: MIN_FOLD_ODDS_COVERAGE_PCT,
      folds: folds.map((fold) => ({
        foldIndex: fold.foldIndex,
        trainFrom: fold.trainFrom.toISOString(),
        trainTo: fold.trainTo.toISOString(),
        validationFrom: fold.validationFrom.toISOString(),
        validationTo: fold.validationTo.toISOString(),
        testFrom: fold.testFrom.toISOString(),
        testTo: fold.testTo.toISOString(),
        complete: fold.complete,
      })),
    };
  }

  private measureWindow(
    bets: DecidedBet[],
    signals: SignalRecord[],
    strategy: BacktestStrategy,
    from: string,
    to: string,
  ): WindowMetrics {
    return {
      kpis: applyStakingAndComputeKpis(
        this.inWindow(bets, (b) => b.decisionAt, from, to),
        strategy,
      ).kpis,
      signals: summarizeSignals(
        this.inWindow(signals, (s) => s.firstSignalAt, from, to),
      ),
    };
  }

  private inWindow<T>(
    items: T[],
    at: (item: T) => Date,
    from: string,
    to: string,
  ): T[] {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    return items.filter((item) => {
      const ms = at(item).getTime();
      return ms >= fromMs && ms < toMs;
    });
  }

  private ineligibility(
    complete: boolean,
    testSignals: SignalAccounting,
    minCoveragePct: number,
  ): WalkForwardIneligibility | null {
    if (!complete) return 'INCOMPLETE_WINDOW';
    if (testSignals.signals === 0 || testSignals.oddsCoveragePct === null) {
      return 'NO_SIGNAL';
    }
    if (testSignals.oddsCoveragePct < minCoveragePct) {
      return 'INSUFFICIENT_ODDS_COVERAGE';
    }
    return null;
  }
}

function foldRowsIneligible(rows: Array<Partial<WalkForwardFold>>): number {
  return rows.filter((row) => row.status === 'INELIGIBLE').length;
}
