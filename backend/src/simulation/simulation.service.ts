import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { sha256Canonical } from '../backtest/backtest-engine.service';
import { BacktestStrategy } from '../backtest/backtest.types';
import { JsonLogger } from '../common/json.logger';
import { extractHtScore } from '../common/utils/stats.utils';
import { BetDecision } from '../database/entities/bet-decision.entity';
import { Fixture } from '../database/entities/fixture.entity';
import {
  SimulationRiskSnapshot,
  SimulationRun,
} from '../database/entities/simulation-run.entity';
import {
  DecisionOutcome,
  DecisionStatus,
  RejectionCode,
  fromCents,
  toCents,
  winningProfitCents,
} from '../execution/execution.types';
import { ExecutableQuoteService } from '../odds/executable-quote.service';
import { ExecutableQuote, ExecutableQuoteTarget } from '../odds/odds.types';
import { resolveSettlement } from '../recommendations/rules/outcome-resolver';
import {
  LiveSignal,
  SmartSuggestionsService,
} from '../recommendations/smart-suggestions.service';

/** Au-delà, un pari exécuté dont le match ne se résout pas est clos en NO_RESULT (mise rendue). */
export const NO_RESULT_AFTER_MS = 24 * 60 * 60 * 1000;
export const MAX_DECISIONS_PAGE = 200;

export type QuoteSelector = (
  target: ExecutableQuoteTarget,
  at: Date,
) => ExecutableQuote | null;

export interface SimulationContext {
  runId: string;
  currency: string;
  strategy: BacktestStrategy;
  risk: SimulationRiskSnapshot;
}

export interface BankrollState {
  initialCents: number;
  realizedProfitCents: number;
  openExposureCents: number;
  availableCents: number;
}

export type NewDecision = Omit<
  BetDecision,
  | 'id'
  | 'createdAt'
  | 'simulationRun'
  | 'decisionOddsSnapshot'
  | 'executableOddsSnapshot'
>;

export interface StartSimulationInput {
  idempotencyKey: string;
  name: string;
  strategyVersion: string;
  strategy: BacktestStrategy;
  currency: string;
  initialBankroll: string;
  maxQuoteAgeMs: number;
  executionLatencyMs: number;
  bookmakerKey?: string;
  maxStakePerBet?: string;
  maxOpenExposure?: string;
}

export interface DecisionFilters {
  cursor?: string;
  limit: number;
  status?: DecisionStatus;
  marketType?: string;
  from?: Date;
  to?: Date;
}

export interface DecisionView {
  id: string;
  decidedAt: Date;
  fixtureId: string;
  marketType: string;
  selection: string;
  status: DecisionStatus;
  rejectionCode: RejectionCode | null;
  stake: string | null;
  decisionOdd: number | null;
  executableOdd: number | null;
  slippagePct: number | null;
  outcome: DecisionOutcome | null;
  profit: string | null;
  currency: string;
}

export interface SimulationSummary {
  runId: string;
  status: SimulationRun['status'];
  currency: string;
  bankroll: {
    initial: string;
    available: string;
    openExposure: string;
    equity: string;
  };
  pnl: { realized: string; turnover: string };
  decisions: {
    total: number;
    byStatus: Record<string, number>;
    rejectionsByCode: Record<string, number>;
  };
  settled: {
    total: number;
    won: number;
    lost: number;
    void: number;
    noResult: number;
  };
  hitRatePct: number | null;
  roiPct: number | null;
  maxDrawdownPct: number;
  latency: { configuredMs: number; avgObservedMs: number | null };
  avgSlippagePct: number | null;
  signals: {
    total: number;
    withExecutableOdd: number;
    coveragePct: number | null;
  };
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export function signalKeyOf(runId: string, signal: LiveSignal): string {
  return sha256(
    `${runId}|${signal.fixtureId}|${signal.teamId ?? ''}|${signal.marketType}`,
  );
}

/**
 * Une clé par issue distincte d'un signal : un ordre par tentative, un rejet
 * par motif. Deux ticks qui évaluent le même signal produisent la même clé.
 */
export function decisionKeyOf(
  runId: string,
  signalKey: string,
  kind: string,
): string {
  return sha256(`${runId}|${signalKey}|${kind}`);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Bankroll virtuelle dérivée uniquement du journal : initial + réalisé − mises ouvertes. */
export function bankrollFromJournal(
  initialBankroll: string,
  rows: Array<Pick<BetDecision, 'status' | 'stake' | 'profit'>>,
): BankrollState {
  const initialCents = toCents(initialBankroll);
  let realizedProfitCents = 0;
  let openExposureCents = 0;
  for (const row of rows) {
    if (row.status === 'COMPLETED' && row.profit !== null) {
      realizedProfitCents += toCents(row.profit);
    }
    if (row.status === 'ORDER_RESERVED' && row.stake !== null) {
      openExposureCents += toCents(row.stake);
    }
  }
  return {
    initialCents,
    realizedProfitCents,
    openExposureCents,
    availableCents: initialCents + realizedProfitCents - openExposureCents,
  };
}

function requestedStakeCents(
  strategy: BacktestStrategy,
  availableCents: number,
): number {
  if (strategy.staking.type === 'PERCENT_BANKROLL') {
    const basisPoints = Math.round(strategy.staking.amount * 100);
    return Math.floor((availableCents * basisPoints) / 10_000);
  }
  return Math.round(strategy.staking.amount * 100);
}

function quoteFields(
  quote: ExecutableQuote,
): Pick<
  NewDecision,
  | 'decisionOddsSnapshotId'
  | 'decisionOdd'
  | 'decisionProviderKey'
  | 'decisionBookmakerKey'
  | 'decisionObservedAt'
  | 'decisionReceivedAt'
> {
  return {
    decisionOddsSnapshotId: quote.snapshotId,
    decisionOdd: quote.oddValue,
    decisionProviderKey: quote.providerKey,
    decisionBookmakerKey: quote.bookmakerKey,
    decisionObservedAt: quote.observedAt,
    decisionReceivedAt: quote.receivedAt,
  };
}

/**
 * Décide les nouveaux signaux d'un tick. Pure : la même entrée produit les mêmes
 * lignes (mêmes clés), ce qui rend l'écriture idempotente sous `INSERT IGNORE`.
 * Mute `bankroll` au fil des réservations pour que deux signaux du même tick
 * ne dépassent jamais la bankroll disponible.
 */
export function planNewDecisions(
  signals: LiveSignal[],
  context: SimulationContext,
  existing: Array<
    Pick<BetDecision, 'signalKey' | 'status' | 'stake' | 'idempotencyKey'>
  >,
  bankroll: BankrollState,
  selectQuote: QuoteSelector,
  now: Date,
): NewDecision[] {
  const { strategy, risk, runId } = context;
  const knownKeys = new Set(existing.map((row) => row.idempotencyKey));
  const rowsBySignal = new Map<string, typeof existing>();
  for (const row of existing) {
    const list = rowsBySignal.get(row.signalKey) ?? [];
    list.push(row);
    rowsBySignal.set(row.signalKey, list);
  }

  const maxStakeCents =
    risk.maxStakePerBet !== null ? toCents(risk.maxStakePerBet) : Infinity;
  const maxExposureCents =
    risk.maxOpenExposure !== null ? toCents(risk.maxOpenExposure) : Infinity;

  const eligible = signals
    .filter((signal) => strategy.markets.includes(signal.marketType))
    .filter((signal) => signal.edgePct >= strategy.minEdgePct)
    .filter(
      (signal) =>
        strategy.minConfidence <= 0 ||
        (signal.confidenceScore !== null &&
          signal.confidenceScore >= strategy.minConfidence),
    )
    .map((signal) => ({ signal, key: signalKeyOf(runId, signal) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const decided = new Set<string>();
  const rows: NewDecision[] = [];

  for (const { signal, key } of eligible) {
    if (decided.has(key)) continue;
    decided.add(key);

    const history = rowsBySignal.get(key) ?? [];
    if (
      history.some(
        (row) => row.status === 'ORDER_RESERVED' || row.status === 'COMPLETED',
      )
    ) {
      continue;
    }
    const attempt = history.filter((row) => row.stake !== null).length;

    const base: NewDecision = {
      simulationRunId: runId,
      signalKey: key,
      idempotencyKey: '',
      fixtureId: signal.fixtureId,
      providerFixtureId: signal.providerFixtureId,
      teamId: signal.teamId,
      isHomeTeam: signal.isHomeTeam,
      marketType: signal.marketType,
      marketKey: signal.quoteTarget.marketKey,
      selectionKey: signal.quoteTarget.selectionKey,
      selection: signal.selection,
      ruleName: signal.ruleName,
      elapsedAtDecision: signal.elapsed,
      minAcceptableOdd: signal.minAcceptableOdd,
      status: 'REJECTED',
      rejectionCode: null,
      decidedAt: now,
      currency: context.currency,
      stake: null,
      decisionOddsSnapshotId: null,
      decisionOdd: null,
      decisionProviderKey: null,
      decisionBookmakerKey: null,
      decisionObservedAt: null,
      decisionReceivedAt: null,
      executionDueAt: null,
      executableOddsSnapshotId: null,
      executableOdd: null,
      executableObservedAt: null,
      executableReceivedAt: null,
      slippagePct: null,
      executedAt: null,
      outcome: null,
      profit: null,
      settledAt: null,
    };

    const reject = (code: RejectionCode, extra: Partial<NewDecision> = {}) => {
      const idempotencyKey = decisionKeyOf(runId, key, `REJECTED:${code}`);
      if (knownKeys.has(idempotencyKey)) return;
      knownKeys.add(idempotencyKey);
      rows.push({
        ...base,
        ...extra,
        idempotencyKey,
        status: 'REJECTED',
        rejectionCode: code,
      });
    };

    const target: ExecutableQuoteTarget = risk.bookmakerKey
      ? { ...signal.quoteTarget, bookmakerKey: risk.bookmakerKey }
      : signal.quoteTarget;
    const quote = selectQuote(target, now);
    if (!quote) {
      reject('NO_EXECUTABLE_ODD');
      continue;
    }
    if (quote.oddValue < signal.minAcceptableOdd) {
      reject('BELOW_MIN_ODD', quoteFields(quote));
      continue;
    }

    const stakeCents = Math.min(
      requestedStakeCents(strategy, bankroll.availableCents),
      bankroll.availableCents,
      maxStakeCents,
      maxExposureCents - bankroll.openExposureCents,
    );
    if (!(stakeCents > 0)) {
      reject('LIMIT_EXCEEDED', quoteFields(quote));
      continue;
    }

    bankroll.availableCents -= stakeCents;
    bankroll.openExposureCents += stakeCents;
    rows.push({
      ...base,
      ...quoteFields(quote),
      idempotencyKey: decisionKeyOf(runId, key, `ORDER:${attempt}`),
      status: 'ORDER_RESERVED',
      stake: fromCents(stakeCents),
      executionDueAt: new Date(now.getTime() + risk.executionLatencyMs),
    });
  }

  return rows;
}

/**
 * Cherche la cote d'exécution à `executionDueAt` chez le même fournisseur et le
 * même bookmaker que la cote de décision. Absente → rejet ; sous le minimum → ODD_MOVED.
 */
export function planExecution(
  row: BetDecision,
  selectQuote: QuoteSelector,
  now: Date,
): Partial<BetDecision> | null {
  if (
    row.status !== 'ORDER_RESERVED' ||
    row.executableOdd !== null ||
    row.executionDueAt === null ||
    row.executionDueAt.getTime() > now.getTime()
  ) {
    return null;
  }

  const quote = selectQuote(
    {
      providerFixtureId: String(row.providerFixtureId),
      marketKey: row.marketKey,
      selectionKey: row.selectionKey,
      providerKey: row.decisionProviderKey ?? undefined,
      bookmakerKey: row.decisionBookmakerKey ?? undefined,
    },
    row.executionDueAt,
  );
  if (!quote) {
    return {
      status: 'REJECTED',
      rejectionCode: 'NO_EXECUTABLE_ODD',
      executedAt: now,
    };
  }

  const executable: Partial<BetDecision> = {
    executableOddsSnapshotId: quote.snapshotId,
    executableOdd: quote.oddValue,
    executableObservedAt: quote.observedAt,
    executableReceivedAt: quote.receivedAt,
    slippagePct:
      row.decisionOdd !== null
        ? round(((quote.oddValue - row.decisionOdd) / row.decisionOdd) * 100, 4)
        : null,
    executedAt: now,
  };
  if (quote.oddValue < row.minAcceptableOdd) {
    return { ...executable, status: 'REJECTED', rejectionCode: 'ODD_MOVED' };
  }
  return executable;
}

export function finalStateOf(fixture: Fixture) {
  const raw = (fixture.raw ?? {}) as Record<string, unknown>;
  return {
    statusShort: fixture.statusShort ?? '',
    scoreHome: fixture.scoreHome,
    scoreAway: fixture.scoreAway,
    htScoreHome: extractHtScore(raw, true),
    htScoreAway: extractHtScore(raw, false),
  };
}

/** Règle un ordre virtuel exécuté. VOID et NO_RESULT rendent la mise (profit nul). */
export function planSettlement(
  row: BetDecision,
  fixture: Fixture | undefined,
  now: Date,
): Partial<BetDecision> | null {
  if (
    row.status !== 'ORDER_RESERVED' ||
    row.executableOdd === null ||
    row.stake === null
  ) {
    return null;
  }

  let outcome: DecisionOutcome | null = fixture
    ? resolveSettlement(
        { marketType: row.marketType, isHomeTeam: row.isHomeTeam },
        finalStateOf(fixture),
      )
    : null;
  if (
    outcome === null &&
    now.getTime() - row.decidedAt.getTime() >= NO_RESULT_AFTER_MS
  ) {
    outcome = 'NO_RESULT';
  }
  if (outcome === null) return null;

  const stakeCents = toCents(row.stake);
  const profitCents =
    outcome === 'WON'
      ? winningProfitCents(stakeCents, row.executableOdd)
      : outcome === 'LOST'
        ? -stakeCents
        : 0;
  return {
    status: 'COMPLETED',
    outcome,
    profit: fromCents(profitCents),
    settledAt: now,
  };
}

/** Agrégats calculés uniquement à partir du journal : aucune autre source de vérité. */
export function summarizeJournal(
  run: Pick<
    SimulationRun,
    'id' | 'status' | 'currency' | 'initialBankroll' | 'riskSnapshot'
  >,
  rows: BetDecision[],
): SimulationSummary {
  const bankroll = bankrollFromJournal(run.initialBankroll, rows);
  const byStatus: Record<string, number> = {};
  const rejectionsByCode: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (row.rejectionCode) {
      rejectionsByCode[row.rejectionCode] =
        (rejectionsByCode[row.rejectionCode] ?? 0) + 1;
    }
  }

  const settled = rows
    .filter((row) => row.status === 'COMPLETED')
    .sort(
      (a, b) =>
        a.settledAt!.getTime() - b.settledAt!.getTime() ||
        a.id.localeCompare(b.id),
    );
  const count = (outcome: DecisionOutcome) =>
    settled.filter((row) => row.outcome === outcome).length;
  const won = count('WON');
  const lost = count('LOST');

  let turnoverCents = 0;
  let equity = bankroll.initialCents;
  let peak = equity;
  let maxDrawdownPct = 0;
  for (const row of settled) {
    if (row.outcome === 'WON' || row.outcome === 'LOST') {
      turnoverCents += toCents(row.stake!);
    }
    equity += toCents(row.profit!);
    peak = Math.max(peak, equity);
    if (peak > 0) {
      maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - equity) / peak) * 100);
    }
  }

  const executed = rows.filter(
    (row) => row.executableOdd !== null && row.executedAt !== null,
  );
  const slippages = executed
    .map((row) => row.slippagePct)
    .filter((value): value is number => value !== null);
  const latencies = executed.map(
    (row) => row.executedAt!.getTime() - row.decidedAt.getTime(),
  );

  const signals = new Map<string, boolean>();
  for (const row of rows) {
    const covered = row.rejectionCode !== 'NO_EXECUTABLE_ODD';
    signals.set(
      row.signalKey,
      (signals.get(row.signalKey) ?? false) || covered,
    );
  }
  const withExecutableOdd = [...signals.values()].filter(Boolean).length;
  const mean = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  const avgSlippage = mean(slippages);
  const avgLatency = mean(latencies);

  return {
    runId: run.id,
    status: run.status,
    currency: run.currency,
    bankroll: {
      initial: fromCents(bankroll.initialCents),
      available: fromCents(bankroll.availableCents),
      openExposure: fromCents(bankroll.openExposureCents),
      equity: fromCents(bankroll.initialCents + bankroll.realizedProfitCents),
    },
    pnl: {
      realized: fromCents(bankroll.realizedProfitCents),
      turnover: fromCents(turnoverCents),
    },
    decisions: { total: rows.length, byStatus, rejectionsByCode },
    settled: {
      total: settled.length,
      won,
      lost,
      void: count('VOID'),
      noResult: count('NO_RESULT'),
    },
    hitRatePct: won + lost > 0 ? round((won / (won + lost)) * 100, 2) : null,
    roiPct:
      turnoverCents > 0
        ? round((bankroll.realizedProfitCents / turnoverCents) * 100, 2)
        : null,
    maxDrawdownPct: round(maxDrawdownPct, 2),
    latency: {
      configuredMs: run.riskSnapshot.executionLatencyMs,
      avgObservedMs: avgLatency === null ? null : Math.round(avgLatency),
    },
    avgSlippagePct: avgSlippage === null ? null : round(avgSlippage, 4),
    signals: {
      total: signals.size,
      withExecutableOdd,
      coveragePct: signals.size
        ? round((withExecutableOdd / signals.size) * 100, 2)
        : null,
    },
  };
}

export function encodeCursor(row: Pick<BetDecision, 'decidedAt' | 'id'>) {
  return Buffer.from(
    JSON.stringify([row.decidedAt.toISOString(), row.id]),
  ).toString('base64url');
}

export function decodeCursor(cursor: string): { decidedAt: Date; id: string } {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      /^[0-9a-f-]{36}$/i.test(parsed[1])
    ) {
      const decidedAt = new Date(parsed[0]);
      if (!Number.isNaN(decidedAt.getTime())) {
        return { decidedAt, id: parsed[1] };
      }
    }
  } catch {
    // curseur illisible : traité ci-dessous
  }
  throw new BadRequestException('Curseur invalide');
}

@Injectable()
export class SimulationService {
  constructor(
    @InjectRepository(SimulationRun)
    private readonly runRepo: Repository<SimulationRun>,
    @InjectRepository(BetDecision)
    private readonly decisionRepo: Repository<BetDecision>,
    private readonly dataSource: DataSource,
    private readonly suggestions: SmartSuggestionsService,
    private readonly quotes: ExecutableQuoteService,
    private readonly logger: JsonLogger,
  ) {}

  /**
   * Démarre un run, ou renvoie celui déjà créé avec la même clé et le même contenu.
   * Même clé, contenu différent → 409. L'unicité est portée par l'index SQL.
   */
  async start(
    input: StartSimulationInput,
    requestedByUserId: string | null,
  ): Promise<SimulationRun> {
    const strategy = JSON.parse(
      JSON.stringify(input.strategy),
    ) as BacktestStrategy;
    strategy.version = input.strategyVersion;
    const risk: SimulationRiskSnapshot = {
      maxQuoteAgeMs: input.maxQuoteAgeMs,
      executionLatencyMs: input.executionLatencyMs,
      bookmakerKey: input.bookmakerKey ?? null,
      maxStakePerBet:
        input.maxStakePerBet !== undefined
          ? fromCents(toCents(input.maxStakePerBet))
          : null,
      maxOpenExposure:
        input.maxOpenExposure !== undefined
          ? fromCents(toCents(input.maxOpenExposure))
          : null,
    };
    const initialBankroll = fromCents(toCents(input.initialBankroll));
    const configHash = sha256Canonical({
      name: input.name,
      strategyVersion: input.strategyVersion,
      strategy,
      risk,
      currency: input.currency,
      initialBankroll,
    });

    await this.runRepo
      .createQueryBuilder()
      .insert()
      .into(SimulationRun)
      .values({
        idempotencyKey: input.idempotencyKey,
        name: input.name,
        strategyVersion: input.strategyVersion,
        strategySnapshot: strategy as unknown as Record<string, unknown>,
        riskSnapshot: risk,
        configHash,
        currency: input.currency,
        initialBankroll,
        status: 'RUNNING',
        requestedByUserId,
        startedAt: new Date(),
        stoppedAt: null,
        lastTickAt: null,
      })
      .orIgnore()
      .execute();

    const run = await this.runRepo.findOneByOrFail({
      idempotencyKey: input.idempotencyKey,
    });
    if (run.configHash !== configHash) {
      throw new ConflictException(
        'Cette clé d’idempotence a déjà servi à démarrer un run différent',
      );
    }
    return run;
  }

  /** Arrêt idempotent. Pris sous verrou : aucun tick ne peut décider après `stoppedAt`. */
  /** Runs les plus récents pour la console : sans stratégie figée (volumineuse). */
  listRuns(limit = 20): Promise<SimulationRun[]> {
    return this.runRepo.find({
      select: {
        id: true,
        name: true,
        strategyVersion: true,
        status: true,
        currency: true,
        initialBankroll: true,
        configHash: true,
        startedAt: true,
        stoppedAt: true,
        lastTickAt: true,
        createdAt: true,
      },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async stop(runId: string): Promise<SimulationRun> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SimulationRun);
      const run = await repo
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id: runId })
        .getOne();
      if (!run) throw new NotFoundException(`Simulation ${runId} introuvable`);
      if (run.status === 'RUNNING') {
        run.status = 'STOPPED';
        run.stoppedAt = new Date();
        await repo.update(
          { id: runId },
          { status: run.status, stoppedAt: run.stoppedAt },
        );
      }
      return run;
    });
  }

  /** Runs à faire avancer : en cours, ou arrêtés avec des ordres virtuels encore ouverts. */
  async activeRunIds(): Promise<string[]> {
    const rows = await this.runRepo
      .createQueryBuilder('r')
      .select('r.id', 'id')
      .where('r.status = :running', { running: 'RUNNING' })
      .orWhere(
        'EXISTS (SELECT 1 FROM bet_decisions d WHERE d.simulation_run_id = r.id AND d.status = :reserved)',
        { reserved: 'ORDER_RESERVED' },
      )
      .orderBy('r.id', 'ASC')
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  /**
   * Un tick : exécute les ordres arrivés à échéance de latence, règle ceux dont
   * le match est résolu, puis décide les nouveaux signaux. Tout se fait sous
   * verrou exclusif de la ligne du run : deux ticks concurrents (deux instances,
   * ou un retard du scheduler) sont sérialisés et le second ne voit que l'état
   * laissé par le premier.
   */
  async tick(
    runId: string,
    now: Date = new Date(),
  ): Promise<{ decided: number; executed: number; settled: number } | null> {
    const snapshot = await this.runRepo.findOneBy({ id: runId });
    if (!snapshot) return null;
    const strategy = snapshot.strategySnapshot as unknown as BacktestStrategy;
    // Lecture des signaux hors verrou : elle ne dépend que des données live.
    const signals =
      snapshot.status === 'RUNNING'
        ? await this.suggestions.evaluateLiveSignals(strategy.entryRules)
        : [];

    return this.dataSource.transaction(async (manager) => {
      const run = await manager
        .getRepository(SimulationRun)
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id: runId })
        .getOne();
      if (!run) return null;

      const decisions = manager.getRepository(BetDecision);
      const context: SimulationContext = {
        runId,
        currency: run.currency,
        strategy,
        risk: run.riskSnapshot,
      };
      const accepting = run.status === 'RUNNING';
      const candidateSignals = accepting ? signals : [];
      const signalKeys = [
        ...new Set(candidateSignals.map((s) => signalKeyOf(runId, s))),
      ];

      const open = await decisions.find({
        where: { simulationRunId: runId, status: 'ORDER_RESERVED' },
      });
      const signalHistory = signalKeys.length
        ? await decisions.find({
            select: {
              signalKey: true,
              status: true,
              stake: true,
              idempotencyKey: true,
            },
            where: { simulationRunId: runId, signalKey: In(signalKeys) },
          })
        : [];

      const providerFixtureIds = [
        ...new Set([
          ...candidateSignals.map((s) => s.providerFixtureId),
          ...open.map((row) => String(row.providerFixtureId)),
        ]),
      ];
      const earliest = Math.min(
        now.getTime(),
        ...open
          .map((row) => row.executionDueAt?.getTime())
          .filter((ms): ms is number => ms !== undefined),
      );
      const candidates = providerFixtureIds.length
        ? await this.quotes.loadCandidates({
            providerFixtureIds,
            receivedFrom: new Date(earliest - run.riskSnapshot.maxQuoteAgeMs),
            receivedTo: now,
          })
        : [];
      const selectQuote: QuoteSelector = (target, at) =>
        this.quotes.selectLatest(candidates, {
          target,
          at,
          maxQuoteAgeMs: run.riskSnapshot.maxQuoteAgeMs,
        });

      let executed = 0;
      let settled = 0;
      const changed: BetDecision[] = [];
      for (const row of open) {
        const execution = planExecution(row, selectQuote, now);
        if (execution) {
          Object.assign(row, execution);
          executed += 1;
          changed.push(row);
        }
      }

      const toSettle = open.filter(
        (row) => row.status === 'ORDER_RESERVED' && row.executableOdd !== null,
      );
      const fixtures = toSettle.length
        ? await manager.getRepository(Fixture).findBy({
            id: In([...new Set(toSettle.map((row) => row.fixtureId))]),
          })
        : [];
      const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
      for (const row of toSettle) {
        const settlement = planSettlement(
          row,
          fixtureById.get(row.fixtureId),
          now,
        );
        if (settlement) {
          Object.assign(row, settlement);
          settled += 1;
          if (!changed.includes(row)) changed.push(row);
        }
      }
      // Une seule instruction (INSERT … ON DUPLICATE KEY UPDATE) pour toutes les lignes modifiées.
      if (changed.length) await decisions.upsert(changed, ['id']);

      let newRows: NewDecision[] = [];
      if (candidateSignals.length) {
        const bankroll = await this.bankrollOf(
          manager.getRepository(BetDecision),
          run,
        );
        newRows = planNewDecisions(
          candidateSignals,
          context,
          signalHistory,
          bankroll,
          selectQuote,
          now,
        );
        if (newRows.length) {
          await decisions
            .createQueryBuilder()
            .insert()
            .into(BetDecision)
            .values(newRows)
            .orIgnore()
            .execute();
        }
      }

      await manager
        .getRepository(SimulationRun)
        .update({ id: runId }, { lastTickAt: now });

      if (newRows.length || executed || settled) {
        this.logger.log(
          {
            event: 'simulation_tick',
            runId,
            decided: newRows.length,
            executed,
            settled,
          },
          'SimulationService',
        );
      }
      return { decided: newRows.length, executed, settled };
    });
  }

  async getRun(runId: string): Promise<SimulationRun> {
    const run = await this.runRepo.findOneBy({ id: runId });
    if (!run) throw new NotFoundException(`Simulation ${runId} introuvable`);
    return run;
  }

  async listDecisions(
    runId: string,
    filters: DecisionFilters,
  ): Promise<{ data: DecisionView[]; nextCursor: string | null }> {
    await this.getRun(runId);
    const limit = Math.min(Math.max(filters.limit, 1), MAX_DECISIONS_PAGE);
    const query = this.decisionRepo
      .createQueryBuilder('d')
      .where('d.simulationRunId = :runId', { runId });
    if (filters.status)
      query.andWhere('d.status = :status', { status: filters.status });
    if (filters.marketType)
      query.andWhere('d.marketType = :marketType', {
        marketType: filters.marketType,
      });
    if (filters.from)
      query.andWhere('d.decidedAt >= :from', { from: filters.from });
    if (filters.to) query.andWhere('d.decidedAt < :to', { to: filters.to });
    if (filters.cursor) {
      const cursor = decodeCursor(filters.cursor);
      query.andWhere(
        new Brackets((qb) => {
          qb.where('d.decidedAt < :cursorAt', {
            cursorAt: cursor.decidedAt,
          }).orWhere('d.decidedAt = :cursorAt AND d.id < :cursorId', {
            cursorAt: cursor.decidedAt,
            cursorId: cursor.id,
          });
        }),
      );
    }

    const rows = await query
      .orderBy('d.decidedAt', 'DESC')
      .addOrderBy('d.id', 'DESC')
      .take(limit + 1)
      .getMany();
    const page = rows.slice(0, limit);
    return {
      data: page.map((row) => ({
        id: row.id,
        decidedAt: row.decidedAt,
        fixtureId: row.fixtureId,
        marketType: row.marketType,
        selection: row.selection,
        status: row.status,
        rejectionCode: row.rejectionCode,
        stake: row.stake,
        decisionOdd: row.decisionOdd,
        executableOdd: row.executableOdd,
        slippagePct: row.slippagePct,
        outcome: row.outcome,
        profit: row.profit,
        currency: row.currency,
      })),
      nextCursor:
        rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  async summary(runId: string): Promise<SimulationSummary> {
    const run = await this.getRun(runId);
    const rows = await this.decisionRepo.find({
      where: { simulationRunId: runId },
    });
    return summarizeJournal(run, rows);
  }

  /** Bankroll calculée en SQL (sommes groupées), même formule que `bankrollFromJournal`. */
  private async bankrollOf(
    repo: Repository<BetDecision>,
    run: SimulationRun,
  ): Promise<BankrollState> {
    const raw = await repo
      .createQueryBuilder('d')
      .select(
        "COALESCE(SUM(CASE WHEN d.status = 'COMPLETED' THEN d.profit ELSE 0 END), 0)",
        'realized',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN d.status = 'ORDER_RESERVED' THEN d.stake ELSE 0 END), 0)",
        'open',
      )
      .where('d.simulationRunId = :runId', { runId: run.id })
      .getRawOne<{ realized: string | number; open: string | number }>();
    const initialCents = toCents(run.initialBankroll);
    const realizedProfitCents = toCents(String(raw?.realized ?? '0'));
    const openExposureCents = toCents(String(raw?.open ?? '0'));
    return {
      initialCents,
      realizedProfitCents,
      openExposureCents,
      availableCents: initialCents + realizedProfitCents - openExposureCents,
    };
  }
}
