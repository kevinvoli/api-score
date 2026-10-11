import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { describePermission } from '../../lib/hooks/useCurrentUser';
import type { AuthUser } from '../../lib/types/auth';
import type { ControlView, ExecutionMode } from '../../lib/types/execution';
import {
  ExecutionControlPanel,
  ExecutionControlPanelProps,
  deriveControlDisplay,
  modeTargets,
  parseEvidenceIds,
} from './ExecutionControlPanel';

const control = (mode: ExecutionMode, overrides: Partial<ControlView> = {}): ControlView => ({
  readable: true,
  mode,
  version: 4,
  activeRiskPolicyId: 'p1',
  stopReason: mode === 'DISABLED' ? 'Arrêt manuel de test' : null,
  stopSource: mode === 'DISABLED' ? 'MANUAL' : null,
  changedByUserId: 'u1',
  changedAt: '2026-10-10T12:00:00.000Z',
  realMoneyInterlockOpen: false,
  activeLimits: null,
  reconciliation: { status: 'NEVER_RUN', lastRunAt: null, criticalCount: 0 },
  ...overrides,
});

const user = (role: AuthUser['role']): AuthUser => ({ id: 'u', email: 'u@x.y', role });

const permissions = (role: AuthUser['role'] | null) => ({
  canStop: describePermission(role ? user(role) : null, false, 'ADMIN'),
  canChangeMode: describePermission(role ? user(role) : null, false, 'ADMIN'),
});

const render = (overrides: Partial<ExecutionControlPanelProps> = {}) =>
  renderToStaticMarkup(
    <ExecutionControlPanel
      control={control('SANDBOX')}
      isLoading={false}
      isError={false}
      {...permissions('ADMIN')}
      onStop={vi.fn()}
      stopPending={false}
      stopError={null}
      onChangeMode={vi.fn()}
      modePending={false}
      modeError={null}
      {...overrides}
    />,
  );

/** Attributs de l'élément ouvrant qui contient `marker` (ex. `id="stop-reason"`). */
const tagWith = (html: string, marker: string): string => {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
};

const buttonLabelled = (html: string, label: string): string => {
  const end = html.indexOf(`>${label}</button>`);
  expect(end).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<button', end), end + 1);
};

describe('deriveControlDisplay()', () => {
  it('backend injoignable : inconnu, jamais actif, même avec un état actif en cache', () => {
    for (const mode of ['SIMULATION', 'SANDBOX', 'LIVE_CANARY'] as const) {
      const display = deriveControlDisplay({ control: control(mode), isLoading: false, isError: true });
      expect(display).toMatchObject({ tone: 'unknown', label: 'État inconnu', isActive: false });
    }
  });

  it('chargement : inconnu et inactif', () => {
    expect(deriveControlDisplay({ control: undefined, isLoading: true, isError: false })).toMatchObject({
      tone: 'unknown',
      isActive: false,
    });
  });

  it('contrôle illisible : arrêté avec le motif du backend', () => {
    expect(
      deriveControlDisplay({
        control: control('SANDBOX', { readable: false, stopReason: 'Ligne de contrôle absente' }),
        isLoading: false,
        isError: false,
      }),
    ).toEqual({
      tone: 'stopped',
      label: 'Arrêtée — contrôle illisible',
      detail: 'Ligne de contrôle absente',
      isActive: false,
    });
  });

  it('suit le mode persisté ; le canary réel est signalé comme danger', () => {
    expect(deriveControlDisplay({ control: control('DISABLED'), isLoading: false, isError: false })).toMatchObject({
      tone: 'stopped',
      isActive: false,
    });
    expect(deriveControlDisplay({ control: control('SIMULATION'), isLoading: false, isError: false })).toMatchObject({
      tone: 'active',
      isActive: true,
    });
    const live = deriveControlDisplay({ control: control('LIVE_CANARY'), isLoading: false, isError: false });
    expect(live).toMatchObject({ tone: 'danger', label: 'Active — ARGENT RÉEL' });
    expect(live.detail).toContain('second verrou fermé');
  });
});

describe('modeTargets() et parseEvidenceIds()', () => {
  it('propose la marche supérieure puis les modes inférieurs, jamais DISABLED', () => {
    expect(modeTargets('DISABLED')).toEqual(['SIMULATION']);
    expect(modeTargets('SANDBOX')).toEqual(['LIVE_CANARY', 'SIMULATION']);
    expect(modeTargets('LIVE_CANARY')).toEqual(['SANDBOX', 'SIMULATION']);
  });

  it('découpe les identifiants sur virgules, espaces et retours à la ligne', () => {
    expect(parseEvidenceIds(' a, b\nc ;; ')).toEqual(['a', 'b', 'c']);
    expect(parseEvidenceIds('')).toEqual([]);
  });
});

describe('<ExecutionControlPanel />', () => {
  it('VIEWER : lecture seule, arrêt et changement de mode désactivés avec la raison', () => {
    const html = render(permissions('VIEWER'));
    expect(buttonLabelled(html, 'Arrêter maintenant')).toContain('disabled');
    expect(buttonLabelled(html, 'Demander le changement')).toContain('disabled');
    expect(tagWith(html, 'id="stop-reason"')).toContain('disabled');
    expect(tagWith(html, 'aria-label="Mode cible"')).toContain('disabled');
    expect(html).toContain('Action réservée aux administrateurs');
    expect(html).toContain('Active — sandbox');
  });

  it('OPERATOR : ni arrêt ni changement de mode (contrat 3.4)', () => {
    const html = render(permissions('OPERATOR'));
    expect(buttonLabelled(html, 'Arrêter maintenant')).toContain('disabled');
    expect(tagWith(html, 'aria-label="Mode cible"')).toContain('disabled');
  });

  it('ADMIN : saisie du motif possible ; le bouton attend un motif, sans autre confirmation', () => {
    const html = render(permissions('ADMIN'));
    expect(tagWith(html, 'id="stop-reason"')).not.toContain('disabled');
    expect(tagWith(html, 'aria-label="Mode cible"')).not.toContain('disabled');
    expect(buttonLabelled(html, 'Arrêter maintenant')).toContain('disabled');
    expect(html).toContain('version attendue : 4');
    expect(html).not.toContain('confirm');
  });

  it('pendant l’envoi, le bouton est désactivé (pas de second clic)', () => {
    const html = render({ stopPending: true });
    expect(buttonLabelled(html, 'Arrêt en cours…')).toContain('disabled');
  });

  it('backend injoignable : état inconnu, aucun « actif », arrêt toujours saisissable, mode bloqué', () => {
    const html = render({ control: control('SANDBOX'), isError: true });
    expect(html).toContain('État inconnu');
    expect(html).not.toContain('Active —');
    expect(html).not.toContain('data-active="true"');
    expect(tagWith(html, 'id="stop-reason"')).not.toContain('disabled');
    expect(tagWith(html, 'aria-label="Mode cible"')).toContain('disabled');
    expect(html).toContain('Indisponible tant que l’état n’est pas relu.');
    expect(html).toContain('version attendue : —');
  });

  it('affiche l’erreur de conflit transmise par la page', () => {
    const html = render({ modeError: 'Conflit de version : l’état a changé' });
    expect(html).toContain('Conflit de version');
  });

  it('arrêt automatique : origine et motif visibles', () => {
    const html = render({
      control: control('DISABLED', { stopSource: 'AUTOMATIC', stopReason: 'AUTO:UNKNOWN_ORDER_TOO_OLD' }),
    });
    expect(html).toContain('Arrêt automatique');
    expect(html).toContain('AUTO:UNKNOWN_ORDER_TOO_OLD');
    expect(html).toContain('data-active="false"');
  });
});
