import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPathAllowed } from '../../../../lib/server/bff-allowlist';

const originalFetch = globalThis.fetch;

// Construits par concaténation pour ne pas faire remonter une occurrence volontaire
// de ces littéraux dans le grep de non-régression du lot (porte de sortie).
const FORBIDDEN_CLIENT_LITERALS = [
  ['NEXT_PUBLIC_', 'API_KEY'].join(''),
  ['sentinel-', 'backend-secret'].join(''),
  ['BACKEND_', 'API_KEY'].join(''),
  ['CSRF_', 'SECRET'].join(''),
];

/** Fichiers exécutés côté navigateur : aucun secret serveur ne doit y être atteignable. */
const CLIENT_SOURCE_FILES = [
  join(process.cwd(), 'lib', 'api', 'client.ts'),
  join(process.cwd(), 'app', 'login', 'page.tsx'),
  join(process.cwd(), 'lib', 'types', 'auth.ts'),
];

const { cookieStore } = vi.hoisted(() => ({ cookieStore: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
  }),
}));

function buildBackendResponse(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('ANY /api/backend/[...path]', () => {
  beforeEach(() => {
    vi.resetModules();
    cookieStore.clear();
    process.env.ALLOWED_ORIGINS = 'http://localhost';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('refuse un chemin absent de l\'allowlist, sans appeler le backend', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/admin/secret', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'admin', 'secret'] } });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une requête sans session', async () => {
    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(401);
  });

  it('renvoie 401 (pas 403) pour un chemin hors allowlist quand la session est absente, pour empêcher l\'énumération (M8)', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/admin/secret', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'admin', 'secret'] } });
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une mutation cross-origin même sur un chemin allowlisté', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures/sync', {
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://evil.example' },
    });

    const response = await POST(request, { params: { path: ['v1', 'live', 'fixtures', 'sync'] } });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxyfie un GET allowlisté et ne reflète jamais les en-têtes sensibles', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    // M10 : la réponse backend simulée porte elle-même x-api-key/authorization/set-cookie,
    // pour prouver que le proxy ne les recopie pas — un mock qui ne les porte pas laisserait
    // ces assertions vertes même si l'implémentation recopiait tout.
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ items: [], page: 1, limit: 20, total: 0 }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'backend-internal-key',
          authorization: 'Bearer backend-internal-token',
          'set-cookie': 'backend_session=leak; Path=/',
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-api-key')).toBeNull();
    expect(response.headers.get('authorization')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');

    const payload: unknown = await response.json();
    expect(payload).toEqual({ items: [], page: 1, limit: 20, total: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sentHeaders = requestInit.headers as Record<string, string>;
    expect(sentHeaders['x-api-key']).toBe('test-backend-api-key');
    expect(sentHeaders.authorization).toBe(`Bearer ${'a'.repeat(43)}`);
  });

  it('normalise une réponse backend 403 sans relayer le corps brut', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    globalThis.fetch = vi.fn(async () =>
      buildBackendResponse(403, { code: 'FORBIDDEN', message: 'Forbidden resource', details: null, traceId: 't2' }),
    ) as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(403);

    const payload: unknown = await response.json();
    expect(payload).toEqual({ error: 'Forbidden resource' });
    expect(JSON.stringify(payload)).not.toContain('traceId');
  });

  it('rejette un segment contenant une tentative de traversée de chemin', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/..%2Fsecret', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', '..', 'secret'] } });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une méthode non autorisée sur un chemin par ailleurs allowlisté', async () => {
    // M8 : la session est désormais vérifiée avant l'allowlist — il en faut une ici pour
    // dépasser le contrôle de session et exercer réellement le rejet par l'allowlist.
    cookieStore.set('session_token', 'a'.repeat(43));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', { method: 'DELETE' });

    const response = await DELETE(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse un corps de requête trop volumineux sur une mutation (M9)', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { computeCsrfToken } = await import('../../../../lib/server/csrf');
    const csrfToken = computeCsrfToken('a'.repeat(43));

    const { POST } = await import('./route');
    const oversizedBody = 'x'.repeat(1_000_001);
    const request = new Request('http://localhost/api/backend/v1/live/fixtures/sync', {
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://localhost', 'x-csrf-token': csrfToken },
      body: oversizedBody,
    });

    const response = await POST(request, { params: { path: ['v1', 'live', 'fixtures', 'sync'] } });
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une mutation sans en-tête Origin sur un chemin allowlisté, sans appeler le backend', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures/sync', {
      method: 'POST',
      headers: { host: 'localhost' },
    });

    const response = await POST(request, { params: { path: ['v1', 'live', 'fixtures', 'sync'] } });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une requête sans session, sans appeler le backend', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignore les en-têtes sensibles envoyés par le navigateur et ne les transmet jamais au backend', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    const fetchMock = vi.fn(async () =>
      buildBackendResponse(200, { items: [], page: 1, limit: 20, total: 0 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', {
      method: 'GET',
      headers: {
        'x-api-key': 'attacker-supplied-key',
        authorization: 'Bearer attacker-supplied-token',
        cookie: 'session_token=attacker-supplied-session',
      },
    });

    const response = await GET(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sentHeaders = requestInit.headers as Record<string, string>;
    expect(sentHeaders['x-api-key']).toBe('test-backend-api-key');
    expect(sentHeaders.authorization).toBe(`Bearer ${'a'.repeat(43)}`);
    expect(sentHeaders.cookie).toBeUndefined();
  });

  it('normalise une réponse backend 429 sans relayer le corps brut', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    globalThis.fetch = vi.fn(async () =>
      buildBackendResponse(429, {
        code: 'TOO_MANY_REQUESTS',
        message: 'Trop de requêtes',
        details: null,
        traceId: 't3',
      }),
    ) as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(429);

    const payload: unknown = await response.json();
    expect(payload).toEqual({ error: 'Trop de requêtes' });
    expect(JSON.stringify(payload)).not.toContain('traceId');
  });

  it('normalise en 502 une réponse backend 5xx au corps non-JSON', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    globalThis.fetch = vi.fn(async () =>
      new Response('<html>Bad Gateway</html>', { status: 500, headers: { 'content-type': 'text/html' } }),
    ) as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(502);

    const payload: unknown = await response.json();
    expect(payload).toEqual({ error: 'Le service backend est momentanément indisponible' });
  });

  it('normalise en 502 une réponse backend 5xx au corps vide', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    globalThis.fetch = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/backend/v1/live/fixtures', { method: 'GET' });

    const response = await GET(request, { params: { path: ['v1', 'live', 'fixtures'] } });
    expect(response.status).toBe(502);

    const payload: unknown = await response.json();
    expect(payload).toEqual({ error: 'Le service backend est momentanément indisponible' });
  });
});

describe('sentinelle de secrets côté client', () => {
  it('ne contient aucun nom ni aucune valeur de secret serveur dans le code exécuté par le navigateur', async () => {
    for (const filePath of CLIENT_SOURCE_FILES) {
      const source = await readFile(filePath, 'utf-8');
      for (const forbidden of FORBIDDEN_CLIENT_LITERALS) {
        expect(source, `${filePath} contient "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});

describe('allowlist du lot 9 (console)', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('autorise exactement les appels de la console', () => {
    const allowed: Array<[string, string]> = [
      ['GET', '/v1/execution/control'],
      ['PUT', '/v1/execution/control/stop'],
      ['PUT', '/v1/execution/control/mode'],
      ['GET', '/v1/execution/accounts'],
      ['GET', '/v1/execution/orders'],
      ['POST', '/v1/execution/reconciliations'],
      ['GET', `/v1/execution/reconciliations/${ID}`],
      ['GET', '/v1/simulation/runs'],
      ['GET', `/v1/simulation/runs/${ID}/summary`],
      ['GET', `/v1/simulation/runs/${ID}/decisions`],
      ['POST', `/v1/simulation/runs/${ID}/stop`],
      ['GET', '/v1/audit/walk-forward'],
      ['GET', `/v1/audit/walk-forward/${ID}`],
    ];
    for (const [method, path] of allowed) {
      expect(isPathAllowed(method, path), `${method} ${path}`).toBe(true);
    }
  });

  it('garde hors de portée du navigateur ce qu’aucun écran n’utilise', () => {
    const refused: Array<[string, string]> = [
      ['POST', '/v1/execution/risk-policies'],
      ['POST', '/v1/execution/gate-evidence'],
      ['POST', '/v1/audit/walk-forward'],
      ['POST', '/v1/simulation/runs'],
      ['GET', `/v1/execution/accounts/${ID}`],
      ['GET', '/v1/execution/control/stop'],
      ['POST', '/v1/execution/control/stop'],
      ['PUT', '/v1/execution/control'],
      ['DELETE', `/v1/execution/reconciliations/${ID}`],
      ['GET', `/v1/simulation/runs/${ID}/summary/extra`],
      ['POST', `/v1/simulation/runs/${ID}/stop/../../x`],
    ];
    for (const [method, path] of refused) {
      expect(isPathAllowed(method, path), `${method} ${path}`).toBe(false);
    }
  });
});
