'use client';

import { useState } from 'react';
import type { Permission } from '../../lib/hooks/useCurrentUser';
import {
  ControlView,
  EXECUTION_MODES,
  ExecutionMode,
  GATES_REQUIRED_TO_ENTER,
} from '../../lib/types/execution';
import { fmtDateTime } from './format';
import styles from './execution.module.css';

export type ControlTone = 'stopped' | 'unknown' | 'active' | 'danger';

export interface ControlDisplay {
  tone: ControlTone;
  label: string;
  detail: string;
  /** Vrai seulement si un état lu à l'instant indique une exécution en marche. */
  isActive: boolean;
}

const MODE_LABELS: Record<ExecutionMode, string> = {
  DISABLED: 'Arrêtée',
  SIMULATION: 'Simulation',
  SANDBOX: 'Sandbox',
  LIVE_CANARY: 'Canary réel',
};

export const modeLabel = (mode: ExecutionMode): string => MODE_LABELS[mode];

/**
 * Traduit la lecture du contrôle en état affiché. Toute incertitude (chargement, backend
 * injoignable, même avec une donnée en cache, état illisible) est montrée comme arrêtée ou
 * inconnue, jamais comme active.
 */
export function deriveControlDisplay(input: {
  control: ControlView | undefined;
  isLoading: boolean;
  isError: boolean;
}): ControlDisplay {
  const { control, isLoading, isError } = input;
  if (isError) {
    return {
      tone: 'unknown',
      label: 'État inconnu',
      detail:
        'Le backend ne répond pas. Considérez l’exécution comme arrêtée tant que l’état n’a pas été relu.',
      isActive: false,
    };
  }
  if (isLoading || !control) {
    return {
      tone: 'unknown',
      label: 'Lecture de l’état…',
      detail: 'Aucune action n’est possible tant que l’état n’est pas connu.',
      isActive: false,
    };
  }
  if (!control.readable) {
    return {
      tone: 'stopped',
      label: 'Arrêtée — contrôle illisible',
      detail: control.stopReason ?? 'Le contrôle d’exécution est illisible : aucune mise n’est possible.',
      isActive: false,
    };
  }
  switch (control.mode) {
    case 'DISABLED':
      return {
        tone: 'stopped',
        label: 'Arrêtée',
        detail: control.stopReason ?? 'Aucune décision n’est exécutée.',
        isActive: false,
      };
    case 'SIMULATION':
      return {
        tone: 'active',
        label: 'Active — simulation',
        detail: 'Décisions exécutées sur une bankroll virtuelle. Aucun opérateur n’est contacté.',
        isActive: true,
      };
    case 'SANDBOX':
      return {
        tone: 'active',
        label: 'Active — sandbox',
        detail: 'Ordres envoyés à un opérateur de test. Aucun argent réel.',
        isActive: true,
      };
    case 'LIVE_CANARY':
      return {
        tone: 'danger',
        label: 'Active — ARGENT RÉEL',
        detail: control.realMoneyInterlockOpen
          ? 'Canary réel en cours : chaque ordre engage de l’argent.'
          : 'Mode réel enregistré mais second verrou fermé : toute réservation est refusée.',
        isActive: true,
      };
  }
}

/**
 * Cibles proposées dans le formulaire : la marche supérieure (montée d'un cran) et les modes
 * inférieurs. DISABLED passe par l'arrêt. Le backend reste seul juge de la transition.
 */
export function modeTargets(current: ExecutionMode): ExecutionMode[] {
  const index = EXECUTION_MODES.indexOf(current);
  const up = EXECUTION_MODES[index + 1];
  const down = EXECUTION_MODES.slice(1, index);
  return [...(up ? [up] : []), ...down.reverse()];
}

/** Identifiants de preuves saisis séparés par des virgules, espaces ou retours à la ligne. */
export const parseEvidenceIds = (raw: string): string[] =>
  raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

export interface ExecutionControlPanelProps {
  control: ControlView | undefined;
  isLoading: boolean;
  isError: boolean;
  canStop: Permission;
  canChangeMode: Permission;
  onStop: (reason: string) => void;
  stopPending: boolean;
  stopError: string | null;
  onChangeMode: (input: { targetMode: ExecutionMode; reason: string; gateEvidenceIds: string[] }) => void;
  modePending: boolean;
  modeError: string | null;
}

const REASON_MAX = 500;

export function ExecutionControlPanel(props: ExecutionControlPanelProps) {
  const { control, canStop, canChangeMode } = props;
  const display = deriveControlDisplay(props);
  const [stopReason, setStopReason] = useState('');
  const fresh = !props.isError && !props.isLoading && control !== undefined;
  const readable = fresh && control.readable && control.version !== null;
  const targets = readable ? modeTargets(control.mode) : [];
  const [target, setTarget] = useState<ExecutionMode | ''>('');
  const [modeReason, setModeReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const selectedTarget = target && targets.includes(target) ? target : (targets[0] ?? '');

  const stopDisabled = !canStop.allowed || props.stopPending || stopReason.trim().length === 0;
  const modeDisabled =
    !canChangeMode.allowed || props.modePending || !readable || !selectedTarget || modeReason.trim().length === 0;

  return (
    <section className={styles.panel} aria-label="Contrôle d’exécution">
      <h3 className={styles.panelTitle}>Contrôle d’exécution</h3>

      <div className={styles.status} data-tone={display.tone} data-active={display.isActive ? 'true' : 'false'}>
        <div>
          <div className={styles.statusLabel}>{display.label}</div>
          <div className={styles.statusDetail}>{display.detail}</div>
        </div>
      </div>

      {fresh && (
        <dl className={styles.facts}>
          <div>
            <dt>Mode</dt>
            <dd>{modeLabel(control.mode)}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{control.version ?? '—'}</dd>
          </div>
          <div>
            <dt>Dernier changement</dt>
            <dd>{fmtDateTime(control.changedAt)}</dd>
          </div>
          <div>
            <dt>Origine</dt>
            <dd>{control.stopSource === 'AUTOMATIC' ? 'Arrêt automatique' : (control.stopSource ?? '—')}</dd>
          </div>
          <div>
            <dt>Second verrou argent réel</dt>
            <dd>{control.realMoneyInterlockOpen ? 'Ouvert' : 'Fermé'}</dd>
          </div>
          {control.stopReason && (
            <div>
              <dt>Motif</dt>
              <dd>{control.stopReason}</dd>
            </div>
          )}
        </dl>
      )}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!stopDisabled) props.onStop(stopReason.trim());
        }}
      >
        <label className={styles.label} htmlFor="stop-reason">
          Motif de l’arrêt (obligatoire, journalisé)
        </label>
        <textarea
          id="stop-reason"
          className={styles.textarea}
          maxLength={REASON_MAX}
          value={stopReason}
          onChange={(event) => setStopReason(event.target.value)}
          disabled={!canStop.allowed}
        />
        <div className={styles.row}>
          <button
            type="submit"
            className={styles.dangerButton}
            disabled={stopDisabled}
            title={canStop.reason ?? undefined}
          >
            {props.stopPending ? 'Arrêt en cours…' : 'Arrêter maintenant'}
          </button>
          {!canStop.allowed && <span className={styles.hint}>{canStop.reason}</span>}
        </div>
        {props.stopError && <p className={styles.error}>{props.stopError}</p>}
      </form>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!modeDisabled && selectedTarget) {
            props.onChangeMode({
              targetMode: selectedTarget,
              reason: modeReason.trim(),
              gateEvidenceIds: parseEvidenceIds(evidence),
            });
          }
        }}
      >
        <span className={styles.label}>Changer de mode (version attendue : {readable ? control.version : '—'})</span>
        <div className={styles.row}>
          <select
            aria-label="Mode cible"
            className={styles.select}
            value={selectedTarget}
            onChange={(event) => setTarget(event.target.value as ExecutionMode)}
            disabled={!canChangeMode.allowed || !readable}
          >
            {targets.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabel(mode)}
              </option>
            ))}
          </select>
          {selectedTarget && GATES_REQUIRED_TO_ENTER[selectedTarget].length > 0 && (
            <span className={styles.hint}>
              Preuves de gate exigées pour monter : {GATES_REQUIRED_TO_ENTER[selectedTarget].join(', ')}
            </span>
          )}
        </div>
        <textarea
          aria-label="Motif du changement de mode"
          className={styles.textarea}
          placeholder="Motif (obligatoire)"
          maxLength={REASON_MAX}
          value={modeReason}
          onChange={(event) => setModeReason(event.target.value)}
          disabled={!canChangeMode.allowed || !readable}
        />
        <input
          aria-label="Identifiants des preuves de gate"
          className={`${styles.input} ${styles.mono}`}
          placeholder="Identifiants des preuves de gate, séparés par des virgules"
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          disabled={!canChangeMode.allowed || !readable}
        />
        <div className={styles.row}>
          <button
            type="submit"
            className={styles.button}
            disabled={modeDisabled}
            title={canChangeMode.reason ?? undefined}
          >
            {props.modePending ? 'Changement en cours…' : 'Demander le changement'}
          </button>
          {!canChangeMode.allowed && <span className={styles.hint}>{canChangeMode.reason}</span>}
          {canChangeMode.allowed && !readable && (
            <span className={styles.hint}>Indisponible tant que l’état n’est pas relu.</span>
          )}
        </div>
        {props.modeError && <p className={styles.error}>{props.modeError}</p>}
      </form>
    </section>
  );
}
