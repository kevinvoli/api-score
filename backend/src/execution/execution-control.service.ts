import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { AsyncContextService } from '../common/async-context.service';
import { JsonLogger } from '../common/json.logger';
import { ExecutionControl } from '../database/entities/execution-control.entity';
import { OperationAuditEvent } from '../database/entities/operation-audit-event.entity';
import { RiskPolicy } from '../database/entities/risk-policy.entity';
import {
  AutoStopTrigger,
  CLOCK_TOLERANCE_MS,
  ExecutionMode,
  StopSource,
  isExecutionMode,
  isRealMoneyInterlockOpen,
} from './execution.types';
import { GatePolicyService, transitionShape } from './gate-policy.service';

export const GLOBAL_SCOPE = 'GLOBAL';
const MAX_REASON_LENGTH = 500;

/** Exécution refusée par le contrôle. `unreadable` = l'état n'a pas pu être établi. */
export class ExecutionBlockedError extends Error {
  constructor(
    message: string,
    readonly unreadable: boolean,
  ) {
    super(message);
    this.name = 'ExecutionBlockedError';
  }
}

export interface ControlSnapshot {
  /** false : état illisible ou incohérent, l'exécution est considérée arrêtée. */
  readable: boolean;
  mode: ExecutionMode;
  version: number | null;
  activeRiskPolicyId: string | null;
  stopReason: string | null;
  stopSource: StopSource | null;
  changedByUserId: string | null;
  changedAt: Date | null;
  realMoneyInterlockOpen: boolean;
}

export interface ChangeModeInput {
  targetMode: ExecutionMode;
  reason: string;
  expectedVersion: number;
  gateEvidenceIds: string[];
}

export interface CreateRiskPolicyInput {
  currency: string;
  maxStakePerBet: string;
  maxDailyStake: string;
  maxDailyLoss: string;
  maxOpenExposure: string;
  maxQuoteAgeMs: number;
  /** Active immédiatement la nouvelle version (exige un contrôle à l'arrêt). */
  activate: boolean;
  expectedVersion?: number;
}

/** Texte libre d'audit : une ligne, borné. Jamais de contenu technique (en-têtes, jetons). */
export function sanitizeReason(reason: string): string {
  return reason
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_REASON_LENGTH);
}

/** Lecture fail-closed d'une ligne de contrôle : tout ce qui n'est pas sûr vaut DISABLED. */
export function toSnapshot(
  control: ExecutionControl | null,
  interlockOpen: boolean,
): ControlSnapshot {
  if (!control || !isExecutionMode(control.mode)) {
    return {
      readable: false,
      mode: 'DISABLED',
      version: control?.version ?? null,
      activeRiskPolicyId: null,
      stopReason: control
        ? `Mode inconnu en base : ${control.mode}`
        : 'Ligne de contrôle absente',
      stopSource: null,
      changedByUserId: null,
      changedAt: control?.changedAt ?? null,
      realMoneyInterlockOpen: interlockOpen,
    };
  }
  return {
    readable: true,
    mode: control.mode,
    version: control.version,
    activeRiskPolicyId: control.activeRiskPolicyId,
    stopReason: control.stopReason,
    stopSource: control.stopSource,
    changedByUserId: control.changedByUserId,
    changedAt: control.changedAt,
    realMoneyInterlockOpen: interlockOpen,
  };
}

/**
 * Peut-on engager de l'argent (même virtuel) dans ce mode ? DISABLED : jamais.
 * LIVE_CANARY : seulement si l'interlock d'environnement est ouvert — second verrou,
 * jamais suffisant seul puisque le mode exige lui-même ses gates.
 */
export function executionAllowed(
  mode: ExecutionMode,
  interlockOpen: boolean,
): boolean {
  if (mode === 'DISABLED') return false;
  if (mode === 'LIVE_CANARY') return interlockOpen;
  return true;
}

@Injectable()
export class ExecutionControlService implements OnApplicationBootstrap {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gatePolicy: GatePolicyService,
    private readonly config: ConfigService,
    private readonly asyncContext: AsyncContextService,
    private readonly logger: JsonLogger,
  ) {}

  /** Le kill switch est lu au démarrage : un état illisible est signalé, l'exécution reste arrêtée. */
  async onApplicationBootstrap(): Promise<void> {
    const snapshot = await this.readControl();
    this.logger.log(
      {
        event: snapshot.readable
          ? 'execution_control_loaded'
          : 'execution_control_unreadable',
        mode: snapshot.mode,
        version: snapshot.version,
        realMoneyInterlockOpen: snapshot.realMoneyInterlockOpen,
      },
      'ExecutionControlService',
    );
  }

  isInterlockOpen(): boolean {
    return isRealMoneyInterlockOpen(
      this.config.get<string>('REAL_MONEY_INTERLOCK'),
    );
  }

  /** Ne lève jamais : base indisponible, ligne absente ou mode inconnu → DISABLED. */
  async readControl(): Promise<ControlSnapshot> {
    const interlockOpen = this.isInterlockOpen();
    try {
      const control = await this.dataSource
        .getRepository(ExecutionControl)
        .findOneBy({ scope: GLOBAL_SCOPE });
      return toSnapshot(control, interlockOpen);
    } catch (error) {
      this.logger.error(
        { event: 'execution_control_read_failed' },
        error instanceof Error ? error.stack : undefined,
        'ExecutionControlService',
      );
      return {
        ...toSnapshot(null, interlockOpen),
        stopReason: 'Contrôle illisible (base indisponible)',
      };
    }
  }

  /**
   * À appeler dans la transaction qui engage de l'argent : verrou PARTAGÉ sur la ligne de
   * contrôle (les réservations restent concurrentes entre elles), mais un arrêt, qui prend
   * le verrou exclusif, attend la fin des réservations en cours puis les bloque toutes.
   */
  async lockForExecution(manager: EntityManager): Promise<ExecutionControl> {
    let control: ExecutionControl | null;
    try {
      control = await manager
        .getRepository(ExecutionControl)
        .createQueryBuilder('c')
        .setLock('pessimistic_read')
        .where('c.scope = :scope', { scope: GLOBAL_SCOPE })
        .getOne();
    } catch (error) {
      throw new ExecutionBlockedError(
        `Contrôle illisible : ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
    const snapshot = toSnapshot(control, this.isInterlockOpen());
    if (!snapshot.readable) {
      throw new ExecutionBlockedError(
        snapshot.stopReason ?? 'Contrôle illisible',
        true,
      );
    }
    if (!executionAllowed(snapshot.mode, snapshot.realMoneyInterlockOpen)) {
      throw new ExecutionBlockedError(
        snapshot.mode === 'DISABLED'
          ? 'Exécution arrêtée'
          : 'REAL_MONEY_INTERLOCK fermé',
        false,
      );
    }
    return control!;
  }

  /**
   * Barrière de soumission : le verrou partagé reste tenu jusqu'au retour opérateur.
   * Un arrêt prend le verrou exclusif et ne peut donc être déclaré effectif au milieu
   * d'une soumission ; inversement, toute soumission commencée après l'arrêt est refusée.
   */
  async withSubmissionPermit<T>(
    expectedMode: ExecutionMode,
    submit: () => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const control = await this.lockForExecution(manager);
      if (control.mode !== expectedMode) {
        throw new ExecutionBlockedError(
          `Mode passé à ${control.mode} avant soumission`,
          false,
        );
      }
      return submit();
    });
  }

  /** Écart entre l'horloge applicative et celle de MySQL, en ms (valeur absolue). */
  async clockDriftMs(manager: EntityManager): Promise<number> {
    const before = Date.now();
    const rows: Array<{ now: Date | string }> = await manager.query(
      'SELECT NOW(3) AS now',
    );
    const after = Date.now();
    const dbMs = new Date(rows[0].now).getTime();
    return Math.abs(dbMs - (before + after) / 2);
  }

  async assertClockWithinTolerance(manager: EntityManager): Promise<void> {
    const drift = await this.clockDriftMs(manager);
    if (drift > CLOCK_TOLERANCE_MS) {
      throw new ExecutionBlockedError(
        `Horloge hors tolérance : ${Math.round(drift)} ms`,
        false,
      );
    }
  }

  /**
   * Arrêt immédiat et idempotent. Jamais refusé pour une version périmée : arrêter est
   * toujours sûr. Une ligne absente est recréée à l'arrêt.
   */
  async stop(
    reason: string,
    actorUserId: string | null,
    source: StopSource = 'MANUAL',
    expectedVersion?: number,
  ): Promise<ControlSnapshot> {
    const cleanReason = sanitizeReason(reason) || 'Arrêt';
    const control = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ExecutionControl);
      const current = await repo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.scope = :scope', { scope: GLOBAL_SCOPE })
        .getOne();

      if (!current) {
        await manager.query(
          `INSERT INTO execution_controls (id, scope, mode, version, stop_reason, stop_source, changed_by_user_id, changed_at)
           VALUES (UUID(), ?, 'DISABLED', 1, ?, ?, ?, NOW(6))`,
          [GLOBAL_SCOPE, cleanReason, source, actorUserId],
        );
        const recreated = await repo.findOneByOrFail({ scope: GLOBAL_SCOPE });
        await this.audit(manager, actorUserId, 'EXECUTION_STOP', recreated.id, {
          from: null,
          to: 'DISABLED',
          version: recreated.version,
          source,
          reason: cleanReason,
          recreated: true,
        });
        return recreated;
      }
      if (current.mode === 'DISABLED') return current;

      await manager.query(
        `UPDATE execution_controls
            SET mode = 'DISABLED', version = version + 1, stop_reason = ?, stop_source = ?,
                changed_by_user_id = ?, changed_at = NOW(6)
          WHERE id = ?`,
        [cleanReason, source, actorUserId, current.id],
      );
      const stopped = await repo.findOneByOrFail({ id: current.id });
      await this.audit(manager, actorUserId, 'EXECUTION_STOP', current.id, {
        from: current.mode,
        to: 'DISABLED',
        version: stopped.version,
        expectedVersion: expectedVersion ?? null,
        source,
        reason: cleanReason,
      });
      return stopped;
    });
    return toSnapshot(control, this.isInterlockOpen());
  }

  /** Arrêt automatique : ne lève jamais (la cause est journalisée si l'arrêt lui-même échoue). */
  async autoStop(
    trigger: AutoStopTrigger,
    details: Record<string, string | number | boolean | null> = {},
  ): Promise<boolean> {
    const detail = Object.entries(details)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
    try {
      await this.stop(
        `AUTO:${trigger}${detail ? ` (${detail})` : ''}`,
        null,
        'AUTOMATIC',
      );
      this.logger.warn(
        { event: 'execution_auto_stopped', trigger },
        'ExecutionControlService',
      );
      return true;
    } catch (error) {
      this.logger.error(
        { event: 'execution_auto_stop_failed', trigger },
        error instanceof Error ? error.stack : undefined,
        'ExecutionControlService',
      );
      return false;
    }
  }

  /**
   * Transition de mode versionnée. Monter : une marche, gates prouvées, politique de risque
   * active, et interlock ouvert pour LIVE_CANARY. Descendre : toujours permis.
   */
  async changeMode(
    input: ChangeModeInput,
    actorUserId: string,
  ): Promise<ControlSnapshot> {
    if (input.targetMode === 'DISABLED') {
      return this.stop(
        input.reason,
        actorUserId,
        'MANUAL',
        input.expectedVersion,
      );
    }
    const reason = sanitizeReason(input.reason);
    const interlockOpen = this.isInterlockOpen();

    const control = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ExecutionControl);
      const current = await repo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.scope = :scope', { scope: GLOBAL_SCOPE })
        .getOne();
      if (!current) {
        throw new ServiceUnavailableException(
          'Contrôle d’exécution absent : seul un arrêt est possible',
        );
      }
      if (current.version !== input.expectedVersion) {
        throw new ConflictException(
          `Version attendue ${input.expectedVersion}, version actuelle ${current.version}`,
        );
      }
      const from: ExecutionMode = isExecutionMode(current.mode)
        ? current.mode
        : 'DISABLED';
      const shape = transitionShape(from, input.targetMode);
      if (!shape.allowed) {
        throw new BadRequestException(
          shape.direction === 'NONE'
            ? `Le contrôle est déjà en ${from}`
            : `Transition ${from} → ${input.targetMode} non adjacente`,
        );
      }
      if (shape.direction === 'UP') {
        if (!current.activeRiskPolicyId) {
          throw new BadRequestException(
            'Aucune politique de risque active : impossible de quitter DISABLED',
          );
        }
        if (input.targetMode === 'LIVE_CANARY' && !interlockOpen) {
          throw new ForbiddenException(
            'REAL_MONEY_INTERLOCK fermé : passage en LIVE_CANARY interdit',
          );
        }
        await this.gatePolicy.assertTransitionAllowed(
          manager,
          current.id,
          from,
          input.targetMode,
          input.gateEvidenceIds,
        );
      }

      await manager.query(
        `UPDATE execution_controls
            SET mode = ?, version = version + 1, stop_reason = NULL, stop_source = NULL,
                changed_by_user_id = ?, changed_at = NOW(6)
          WHERE id = ?`,
        [input.targetMode, actorUserId, current.id],
      );
      const updated = await repo.findOneByOrFail({ id: current.id });
      await this.audit(
        manager,
        actorUserId,
        'EXECUTION_MODE_CHANGE',
        current.id,
        {
          from,
          to: input.targetMode,
          version: updated.version,
          expectedVersion: input.expectedVersion,
          reason,
          gateEvidenceIds: [...new Set(input.gateEvidenceIds)].join(','),
        },
      );
      return updated;
    });
    return toSnapshot(control, interlockOpen);
  }

  /** Nouvelle version immuable de politique ; activation seulement contrôle arrêté. */
  async createRiskPolicy(
    input: CreateRiskPolicyInput,
    actorUserId: string,
  ): Promise<RiskPolicy> {
    return this.dataSource.transaction(async (manager) => {
      const control = await manager
        .getRepository(ExecutionControl)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.scope = :scope', { scope: GLOBAL_SCOPE })
        .getOne();
      if (input.activate) {
        if (!control) {
          throw new ServiceUnavailableException('Contrôle d’exécution absent');
        }
        if (control.mode !== 'DISABLED') {
          throw new ConflictException(
            'Une politique ne s’active que contrôle arrêté (DISABLED)',
          );
        }
        if (
          input.expectedVersion !== undefined &&
          control.version !== input.expectedVersion
        ) {
          throw new ConflictException(
            `Version attendue ${input.expectedVersion}, version actuelle ${control.version}`,
          );
        }
      }

      const [{ next }]: Array<{ next: number | string }> = await manager.query(
        'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM risk_policies',
      );
      const repo = manager.getRepository(RiskPolicy);
      const policy = await repo.save(
        repo.create({
          version: Number(next),
          currency: input.currency,
          maxStakePerBet: input.maxStakePerBet,
          maxDailyStake: input.maxDailyStake,
          maxDailyLoss: input.maxDailyLoss,
          maxOpenExposure: input.maxOpenExposure,
          maxQuoteAgeMs: input.maxQuoteAgeMs,
          createdByUserId: actorUserId,
        }),
      );
      await this.audit(
        manager,
        actorUserId,
        'RISK_POLICY_CREATE',
        policy.id,
        {
          version: policy.version,
          currency: policy.currency,
          activate: input.activate,
        },
        'RISK_POLICY',
      );

      if (input.activate && control) {
        await manager.query(
          `UPDATE execution_controls SET active_risk_policy_id = ?, version = version + 1,
                  changed_by_user_id = ?, changed_at = NOW(6) WHERE id = ?`,
          [policy.id, actorUserId, control.id],
        );
        await this.audit(
          manager,
          actorUserId,
          'RISK_POLICY_ACTIVATE',
          control.id,
          {
            riskPolicyId: policy.id,
            riskPolicyVersion: policy.version,
            version: control.version + 1,
          },
        );
      }
      return policy;
    });
  }

  async controlId(): Promise<string | null> {
    const control = await this.dataSource
      .getRepository(ExecutionControl)
      .findOneBy({ scope: GLOBAL_SCOPE });
    return control?.id ?? null;
  }

  async activePolicy(policyId: string | null): Promise<RiskPolicy | null> {
    if (!policyId) return null;
    return this.dataSource
      .getRepository(RiskPolicy)
      .findOneBy({ id: policyId });
  }

  /**
   * Audit dans la transaction de la transition (atomique avec elle). Métadonnées scalaires
   * uniquement, choisies par l'appelant : aucun en-tête, cookie, jeton ni clé n'y transite.
   */
  private async audit(
    manager: EntityManager,
    actorUserId: string | null,
    action: string,
    targetId: string,
    metadata: Record<string, string | number | boolean | null>,
    targetType = 'EXECUTION_CONTROL',
  ): Promise<void> {
    await manager.getRepository(OperationAuditEvent).insert({
      actorUserId,
      action,
      targetType,
      targetId,
      traceId: this.asyncContext.getTraceId() ?? null,
      metadata,
    });
  }
}
