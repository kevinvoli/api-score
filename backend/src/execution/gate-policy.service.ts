import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ExecutionGateEvidence } from '../database/entities/execution-gate-evidence.entity';
import {
  ExecutionMode,
  GATES_REQUIRED_TO_ENTER,
  GateKey,
  GateVerdict,
  MODE_ORDER,
} from './execution.types';

export type TransitionDirection = 'UP' | 'DOWN' | 'NONE';

export interface TransitionShape {
  direction: TransitionDirection;
  /** Une seule marche franchie (ou retour direct à DISABLED, toujours permis). */
  allowed: boolean;
}

/**
 * Forme d'une transition. Monter : une marche à la fois. Descendre : une marche, ou
 * directement à DISABLED (le kill switch ne doit jamais dépendre d'un chemin).
 */
export function transitionShape(
  from: ExecutionMode,
  to: ExecutionMode,
): TransitionShape {
  const delta = MODE_ORDER.indexOf(to) - MODE_ORDER.indexOf(from);
  if (delta === 0) return { direction: 'NONE', allowed: false };
  if (delta > 0) return { direction: 'UP', allowed: delta === 1 };
  return { direction: 'DOWN', allowed: delta === -1 || to === 'DISABLED' };
}

/** Gates à prouver pour une transition : aucune pour descendre. */
export function requiredGates(
  from: ExecutionMode,
  to: ExecutionMode,
): readonly GateKey[] {
  return transitionShape(from, to).direction === 'UP'
    ? GATES_REQUIRED_TO_ENTER[to]
    : [];
}

export interface EvidenceCheck {
  ok: boolean;
  missingGates: GateKey[];
  /** Identifiants fournis mais inutilisables, avec la raison. */
  rejected: Array<{ id: string; reason: string }>;
}

/**
 * Une preuve n'est admissible que si elle existe, porte sur ce contrôle, a un verdict
 * GO et un approbateur humain. Chaque gate requise doit être couverte.
 */
export function checkEvidence(
  required: readonly GateKey[],
  providedIds: readonly string[],
  found: ReadonlyArray<
    Pick<
      ExecutionGateEvidence,
      'id' | 'gateKey' | 'verdict' | 'controlId' | 'approvedByUserId'
    >
  >,
  controlId: string,
): EvidenceCheck {
  const byId = new Map(found.map((evidence) => [evidence.id, evidence]));
  const rejected: EvidenceCheck['rejected'] = [];
  const covered = new Set<GateKey>();

  for (const id of new Set(providedIds)) {
    const evidence = byId.get(id);
    if (!evidence) {
      rejected.push({ id, reason: 'preuve inconnue' });
    } else if (evidence.controlId !== controlId) {
      rejected.push({ id, reason: 'preuve rattachée à un autre contrôle' });
    } else if (evidence.verdict !== 'GO') {
      rejected.push({ id, reason: `verdict ${evidence.verdict}` });
    } else if (!evidence.approvedByUserId) {
      rejected.push({ id, reason: 'aucun approbateur' });
    } else if (!required.includes(evidence.gateKey)) {
      rejected.push({
        id,
        reason: `gate ${evidence.gateKey} non requise pour cette transition`,
      });
    } else {
      covered.add(evidence.gateKey);
    }
  }

  const missingGates = required.filter((gate) => !covered.has(gate));
  return {
    ok: missingGates.length === 0 && rejected.length === 0,
    missingGates,
    rejected,
  };
}

export interface RecordEvidenceInput {
  controlId: string;
  gateKey: GateKey;
  periodFrom: Date;
  periodTo: Date;
  metrics: Record<string, unknown>;
  reportHash: string;
  verdict: GateVerdict;
}

@Injectable()
export class GatePolicyService {
  constructor(
    @InjectRepository(ExecutionGateEvidence)
    private readonly evidenceRepo: Repository<ExecutionGateEvidence>,
  ) {}

  /**
   * Enregistre une preuve immuable approuvée par un ADMIN identifié. Aucune autre voie
   * d'écriture : un adaptateur opérateur ne peut pas s'auto-déclarer une gate.
   */
  async record(
    input: RecordEvidenceInput,
    approvedByUserId: string,
  ): Promise<ExecutionGateEvidence> {
    if (input.periodFrom >= input.periodTo) {
      throw new BadRequestException('periodFrom doit précéder periodTo');
    }
    return this.evidenceRepo.save(
      this.evidenceRepo.create({
        ...input,
        approvedByUserId,
        approvedAt: new Date(),
      }),
    );
  }

  /** Refuse la transition si une gate requise n'est pas couverte par une preuve admissible. */
  async assertTransitionAllowed(
    manager: EntityManager,
    controlId: string,
    from: ExecutionMode,
    to: ExecutionMode,
    evidenceIds: readonly string[],
  ): Promise<void> {
    const required = requiredGates(from, to);
    if (!required.length) return;
    const found = evidenceIds.length
      ? await manager.getRepository(ExecutionGateEvidence).findBy({
          id: In([...new Set(evidenceIds)]),
        })
      : [];
    const check = checkEvidence(required, evidenceIds, found, controlId);
    if (!check.ok) {
      throw new BadRequestException({
        message: `Transition ${from} → ${to} refusée : preuves de gate insuffisantes`,
        missingGates: check.missingGates,
        rejectedEvidence: check.rejected,
      });
    }
  }
}
