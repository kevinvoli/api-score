import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, redirectToLogin } from './client';
import { fetchCurrentUser, logout } from './session';

const originalFetch = globalThis.fetch;

function stubBrowser(pathname: string, cookie = ''): { assign: ReturnType<typeof vi.fn> } {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { pathname, assign } });
  vi.stubGlobal('document', { cookie });
  return { assign };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchCurrentUser()', () => {
  it('renvoie l’utilisateur de la session', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { user: { id: 'u1', email: 'a@b.c', role: 'VIEWER' } }),
    ) as unknown as typeof fetch;

    await expect(fetchCurrentUser()).resolves.toEqual({ id: 'u1', email: 'a@b.c', role: 'VIEWER' });
  });

  it('401 = déconnecté (null), sans erreur ni redirection', async () => {
    const { assign } = stubBrowser('/login');
    globalThis.fetch = vi.fn(async () => jsonResponse(401, { error: 'Session absente' })) as unknown as typeof fetch;

    await expect(fetchCurrentUser()).resolves.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('refuse un rôle inconnu ou une réponse malformée', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { user: { id: 'u1', email: 'a@b.c', role: 'ROOT' } }),
    ) as unknown as typeof fetch;
    await expect(fetchCurrentUser()).rejects.toThrow('Réponse de session invalide');

    globalThis.fetch = vi.fn(async () => jsonResponse(502, { error: 'Le service backend ne répond pas' })) as unknown as typeof fetch;
    await expect(fetchCurrentUser()).rejects.toThrow('Le service backend ne répond pas');
  });
});

describe('logout()', () => {
  it('envoie un POST même origine avec le jeton CSRF du cookie', async () => {
    stubBrowser('/live', 'other=1; csrf_token=abc%20123');
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(logout()).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': 'abc 123' },
    });
  });

  it('part sans en-tête CSRF si le cookie a disparu (le BFF reste idempotent)', async () => {
    stubBrowser('/live', '');
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await logout();
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ headers: {} });
  });

  it('signale un refus du BFF sans lever d’exception', async () => {
    stubBrowser('/live', 'csrf_token=x');
    globalThis.fetch = vi.fn(async () => jsonResponse(403, { error: 'Jeton CSRF invalide' })) as unknown as typeof fetch;

    await expect(logout()).resolves.toBe(false);
  });
});

describe('session expirée pendant la navigation', () => {
  it('apiFetch redirige vers /login sur un 401 du BFF', async () => {
    const { assign } = stubBrowser('/audit');
    globalThis.fetch = vi.fn(async () => jsonResponse(401, { error: 'Session absente' })) as unknown as typeof fetch;

    await expect(apiFetch('/v1/audit/backtest')).rejects.toThrow('Session expirée');
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('ne redirige jamais depuis /login (pas de boucle)', () => {
    const { assign } = stubBrowser('/login');
    redirectToLogin();
    expect(assign).not.toHaveBeenCalled();
  });

  it('un 403 (rôle insuffisant) ne déconnecte pas', async () => {
    const { assign } = stubBrowser('/parametres');
    globalThis.fetch = vi.fn(async () => jsonResponse(403, { error: 'Accès refusé' })) as unknown as typeof fetch;

    await expect(apiFetch('/v1/settings/smart-rules')).rejects.toThrow('API error (403)');
    expect(assign).not.toHaveBeenCalled();
  });
});
