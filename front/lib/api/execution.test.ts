import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import {
  buildReconciliationRequest,
  describeMutationError,
  singleFlight,
  stopExecution,
} from './execution';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe('singleFlight()', () => {
  it('double clic : un seul appel, la même réponse pour les deux', async () => {
    let resolve: (value: string) => void = () => undefined;
    const call = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const send = singleFlight(call);
    const first = send();
    const second = send();
    expect(call).toHaveBeenCalledTimes(1);
    resolve('ok');
    await expect(Promise.all([first, second])).resolves.toEqual(['ok', 'ok']);
  });

  it('un nouvel appel est possible une fois le précédent terminé, même en échec', async () => {
    const call = vi.fn().mockRejectedValueOnce(new Error('panne')).mockResolvedValueOnce('ok');
    const send = singleFlight(call);
    await expect(send()).rejects.toThrow('panne');
    await expect(send()).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(2);
  });
});

describe('describeMutationError()', () => {
  it('409 : conflit de version explicite', () => {
    const message = describeMutationError(new ApiError(409, JSON.stringify({ error: 'Version périmée' })));
    expect(message).toContain('Conflit de version');
    expect(message).toContain('Version périmée');
  });

  it('403 : message du BFF ou refus de rôle', () => {
    expect(describeMutationError(new ApiError(403, JSON.stringify({ error: 'Accès refusé' })))).toBe('Accès refusé');
    expect(describeMutationError(new ApiError(403, 'pas du json'))).toBe('Action refusée pour votre rôle.');
  });

  it('5xx : rien n’est présenté comme confirmé', () => {
    expect(describeMutationError(new ApiError(502, '{}'))).toBe(
      'Backend indisponible : aucune action n’a été confirmée.',
    );
  });
});

describe('buildReconciliationRequest()', () => {
  const accountId = '11111111-1111-4111-8111-111111111111';

  it('24 h glissantes et clé stable dans la minute (double clic → même run)', () => {
    const a = buildReconciliationRequest(accountId, new Date('2026-10-10T12:00:05.000Z'));
    const b = buildReconciliationRequest(accountId, new Date('2026-10-10T12:00:55.000Z'));
    const c = buildReconciliationRequest(accountId, new Date('2026-10-10T12:01:00.000Z'));
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(c.idempotencyKey).not.toBe(a.idempotencyKey);
    expect(new Date(a.to).getTime() - new Date(a.from).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('clé conforme au DTO backend', () => {
    expect(buildReconciliationRequest(accountId).idempotencyKey).toMatch(/^[A-Za-z0-9:_-]{8,128}$/);
  });
});

describe('stopExecution()', () => {
  it('PUT via le BFF avec motif, version et jeton CSRF ; le 409 devient une ApiError typée', async () => {
    vi.stubGlobal('document', { cookie: 'csrf_token=jeton-csrf' });
    vi.stubGlobal('window', undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Version périmée' }), { status: 409 }),
    );
    globalThis.fetch = fetchMock;

    const error = await stopExecution({ reason: 'test', expectedVersion: 4 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/backend/v1/execution/control/stop');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'test', expectedVersion: 4 });
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('jeton-csrf');
  });
});
