import { ExecutionGateEvidence } from '../database/entities/execution-gate-evidence.entity';
import { GATES_REQUIRED_TO_ENTER } from './execution.types';
import {
  checkEvidence,
  requiredGates,
  transitionShape,
} from './gate-policy.service';

const CONTROL = 'control-1';

function evidence(
  id: string,
  overrides: Partial<ExecutionGateEvidence> = {},
): Pick<
  ExecutionGateEvidence,
  'id' | 'gateKey' | 'verdict' | 'controlId' | 'approvedByUserId'
> {
  return {
    id,
    gateKey: 'G1',
    verdict: 'GO',
    controlId: CONTROL,
    approvedByUserId: 'admin-1',
    ...overrides,
  };
}

describe('transitionShape()', () => {
  it('monte d’une seule marche à la fois', () => {
    expect(transitionShape('DISABLED', 'SIMULATION')).toEqual({
      direction: 'UP',
      allowed: true,
    });
    expect(transitionShape('SIMULATION', 'SANDBOX')).toEqual({
      direction: 'UP',
      allowed: true,
    });
    expect(transitionShape('SANDBOX', 'LIVE_CANARY')).toEqual({
      direction: 'UP',
      allowed: true,
    });
    expect(transitionShape('DISABLED', 'SANDBOX').allowed).toBe(false);
    expect(transitionShape('DISABLED', 'LIVE_CANARY').allowed).toBe(false);
    expect(transitionShape('SIMULATION', 'LIVE_CANARY').allowed).toBe(false);
  });

  it('descend d’une marche, ou directement à DISABLED depuis n’importe où', () => {
    expect(transitionShape('LIVE_CANARY', 'SANDBOX').allowed).toBe(true);
    expect(transitionShape('LIVE_CANARY', 'DISABLED').allowed).toBe(true);
    expect(transitionShape('SANDBOX', 'DISABLED').allowed).toBe(true);
    expect(transitionShape('LIVE_CANARY', 'SIMULATION').allowed).toBe(false);
  });

  it('refuse une transition vers le même mode', () => {
    expect(transitionShape('SANDBOX', 'SANDBOX')).toEqual({
      direction: 'NONE',
      allowed: false,
    });
  });
});

describe('requiredGates()', () => {
  it('exige les gates du mode visé en montée, aucune en descente', () => {
    expect(requiredGates('DISABLED', 'SIMULATION')).toEqual(['G1', 'G2']);
    expect(requiredGates('SIMULATION', 'SANDBOX')).toEqual(['G3']);
    expect(requiredGates('SANDBOX', 'LIVE_CANARY')).toEqual(['G4', 'G5', 'G6']);
    expect(requiredGates('LIVE_CANARY', 'SANDBOX')).toEqual([]);
    expect(requiredGates('SIMULATION', 'DISABLED')).toEqual([]);
  });

  it('LIVE_CANARY exige l’approbation explicite G6', () => {
    expect(GATES_REQUIRED_TO_ENTER.LIVE_CANARY).toContain('G6');
  });
});

describe('checkEvidence()', () => {
  const required = ['G1', 'G2'] as const;

  it('accepte des preuves GO, approuvées, du bon contrôle, couvrant chaque gate', () => {
    const found = [evidence('e1'), evidence('e2', { gateKey: 'G2' })];
    expect(checkEvidence(required, ['e1', 'e2'], found, CONTROL)).toEqual({
      ok: true,
      missingGates: [],
      rejected: [],
    });
  });

  it('signale une gate manquante', () => {
    const check = checkEvidence(required, ['e1'], [evidence('e1')], CONTROL);
    expect(check.ok).toBe(false);
    expect(check.missingGates).toEqual(['G2']);
  });

  it.each([
    ['inconnue', [], 'preuve inconnue'],
    ['NO_GO', [evidence('x', { verdict: 'NO_GO' })], 'verdict NO_GO'],
    [
      'autre contrôle',
      [evidence('x', { controlId: 'autre' })],
      'preuve rattachée à un autre contrôle',
    ],
    [
      'sans approbateur',
      [evidence('x', { approvedByUserId: '' })],
      'aucun approbateur',
    ],
    [
      'gate hors transition',
      [evidence('x', { gateKey: 'G6' })],
      'gate G6 non requise pour cette transition',
    ],
  ])('refuse une preuve %s', (_label, found, reason) => {
    const check = checkEvidence(
      required,
      ['e1', 'e2', 'x'],
      [evidence('e1'), evidence('e2', { gateKey: 'G2' }), ...found],
      CONTROL,
    );
    expect(check.ok).toBe(false);
    expect(check.rejected).toEqual([{ id: 'x', reason }]);
  });

  it('aucune preuve fournie : toutes les gates manquent', () => {
    expect(checkEvidence(required, [], [], CONTROL).missingGates).toEqual([
      'G1',
      'G2',
    ]);
  });
});
