import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { describePermission } from '../../lib/hooks/useCurrentUser';
import type { AuthUser } from '../../lib/types/auth';
import type { AccountView, OrderView, ReconciliationRun } from '../../lib/types/execution';
import { BankrollAccountsTable } from './BankrollAccountsTable';
import { OrdersTable, isAmbiguous } from './OrdersTable';
import { ReconciliationStatus, healthTone } from './ReconciliationStatus';

const account: AccountView = {
  id: '11111111-1111-4111-8111-111111111111',
  mode: 'SANDBOX',
  operatorKey: 'sandbox',
  currency: 'EUR',
  availableBalance: '90.10',
  reservedBalance: '9.90',
  exposure: '9.90',
  totalBalance: '100.00',
  version: 3,
  activeLimits: null,
};

const can = (role: AuthUser['role']) =>
  describePermission({ id: 'u', email: 'u@x.y', role }, false, 'OPERATOR');

const renderStatus = (role: AuthUser['role'], run?: ReconciliationRun) =>
  renderToStaticMarkup(
    <ReconciliationStatus
      health={{ status: 'COMPLETED', lastRunAt: '2026-10-10T12:00:00.000Z', criticalCount: 0 }}
      healthUnknown={false}
      accounts={[account]}
      canReconcile={can(role)}
      onStart={vi.fn()}
      pending={false}
      error={null}
      run={run}
    />,
  );

const reconcileButton = (html: string) => {
  const end = html.indexOf('>Réconcilier les dernières 24 h</button>');
  expect(end).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<button', end), end + 1);
};

describe('<ReconciliationStatus />', () => {
  it('OPERATOR peut lancer une réconciliation, VIEWER non', () => {
    expect(reconcileButton(renderStatus('OPERATOR'))).not.toContain('disabled');
    expect(reconcileButton(renderStatus('ADMIN'))).not.toContain('disabled');
    const viewer = renderStatus('VIEWER');
    expect(reconcileButton(viewer)).toContain('disabled');
    expect(viewer).toContain('Action réservée au rôle OPERATOR ou supérieur');
  });

  it('classe les écarts critiques en tête', () => {
    const run: ReconciliationRun = {
      id: 'r1',
      idempotencyKey: 'console:x:1',
      accountId: account.id,
      rangeFrom: '2026-10-09T12:00:00.000Z',
      rangeTo: '2026-10-10T12:00:00.000Z',
      status: 'COMPLETED',
      criticalCount: 1,
      error: null,
      createdAt: '2026-10-10T12:00:00.000Z',
      completedAt: '2026-10-10T12:00:01.000Z',
      items: [
        { id: 'i1', runId: 'r1', orderId: null, itemType: 'ORDER', result: 'MATCH', severity: 'INFO', detail: 'ok', createdAt: '' },
        { id: 'i2', runId: 'r1', orderId: null, itemType: 'BALANCE', result: 'MISMATCH', severity: 'CRITICAL', detail: 'solde divergent', createdAt: '' },
      ],
    };
    const html = renderStatus('OPERATOR', run);
    expect(html.indexOf('solde divergent')).toBeLessThan(html.indexOf('>ok<'));
  });

  it('santé : inconnue tant que le contrôle n’est pas relu, rouge dès un écart critique', () => {
    expect(healthTone(undefined, false)).toBe('warn');
    expect(healthTone({ status: 'COMPLETED', lastRunAt: null, criticalCount: 0 }, true)).toBe('warn');
    expect(healthTone({ status: 'COMPLETED', lastRunAt: null, criticalCount: 2 }, false)).toBe('bad');
    expect(healthTone({ status: 'FAILED', lastRunAt: null, criticalCount: 0 }, false)).toBe('bad');
    expect(healthTone({ status: 'NEVER_RUN', lastRunAt: null, criticalCount: 0 }, false)).toBe('warn');
    expect(healthTone({ status: 'COMPLETED', lastRunAt: null, criticalCount: 0 }, false)).toBe('ok');
  });
});

describe('<OrdersTable />', () => {
  const order = (status: OrderView['status']): OrderView => ({
    id: `o-${status}`,
    decisionId: 'd',
    accountId: account.id,
    mode: 'SANDBOX',
    operatorKey: 'sandbox',
    status,
    rejectionCode: null,
    statusReason: null,
    externalOrderId: status === 'ACCEPTED' ? 'SBX-1' : null,
    currency: 'EUR',
    requestedStake: '5.00',
    requestedOdd: 2,
    minimumOdd: 1.8,
    acceptedStake: null,
    acceptedOdd: null,
    payout: null,
    createdAt: '2026-10-10T12:00:00.000Z',
    settledAt: null,
    receipt: null,
    reconciliation: null,
  });

  it('surligne et compte les ordres ambigus', () => {
    expect(isAmbiguous(order('UNKNOWN'))).toBe(true);
    expect(isAmbiguous(order('RECONCILIATION_REQUIRED'))).toBe(true);
    expect(isAmbiguous(order('ACCEPTED'))).toBe(false);
    const html = renderToStaticMarkup(
      <OrdersTable
        orders={[order('ACCEPTED'), order('UNKNOWN')]}
        isLoading={false}
        isError={false}
        stale={false}
        status={null}
        onStatusChange={vi.fn()}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(html).toContain('1 ordre(s) ambigu(s) à rapprocher');
    expect(html).toContain('5,00 EUR');
    expect(html).toContain('Jamais rapproché');
    expect(html).not.toContain('non confirmée');
  });

  it('backend injoignable : la dernière liste est signalée comme non confirmée', () => {
    const html = renderToStaticMarkup(
      <OrdersTable
        orders={[]}
        isLoading={false}
        isError={false}
        stale={true}
        status={null}
        onStatusChange={vi.fn()}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(html).toContain('dernière liste connue, non confirmée');
    expect(html).not.toContain('Aucun ordre.');
  });

  it('bankroll : soldes en cache signalés quand le backend ne répond plus', () => {
    const live = renderToStaticMarkup(
      <BankrollAccountsTable accounts={[account]} isLoading={false} isError={false} stale={false} />,
    );
    expect(live).toContain('100,00 EUR');
    expect(live).not.toContain('non confirmés');
    const stale = renderToStaticMarkup(
      <BankrollAccountsTable accounts={[account]} isLoading={false} isError={false} stale={true} />,
    );
    expect(stale).toContain('derniers soldes connus, non confirmés');
  });
});
