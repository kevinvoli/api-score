import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

const { cookieStore } = vi.hoisted(() => ({ cookieStore: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
  }),
}));

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.resetModules();
    cookieStore.clear();
    process.env.ALLOWED_ORIGINS = 'http://localhost';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('est idempotent : sans session, répond 204 sans appeler le backend', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/auth/logout', { method: 'POST' });

    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une mutation cross-origin même avec une session active', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    const { computeCsrfToken } = await import('../../../../lib/server/csrf');
    const csrfToken = computeCsrfToken('a'.repeat(43));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: {
        host: 'localhost',
        origin: 'http://evil.example',
        'x-csrf-token': csrfToken,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('refuse une mutation sans en-tête Origin, sans appeler le backend', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { computeCsrfToken } = await import('../../../../lib/server/csrf');
    const csrfToken = computeCsrfToken('a'.repeat(43));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { host: 'localhost', 'x-csrf-token': csrfToken },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('n\'appelle jamais le backend quand la mutation est refusée pour Origin étrangère', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { computeCsrfToken } = await import('../../../../lib/server/csrf');
    const csrfToken = computeCsrfToken('a'.repeat(43));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: {
        host: 'localhost',
        origin: 'http://evil.example',
        'x-csrf-token': csrfToken,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse un jeton CSRF invalide', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: {
        host: 'localhost',
        origin: 'http://localhost',
        'x-csrf-token': 'jeton-invalide',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('révoque la session et nettoie les cookies quand Origin et CSRF sont valides', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;

    const { computeCsrfToken } = await import('../../../../lib/server/csrf');
    const csrfToken = computeCsrfToken('a'.repeat(43));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: {
        host: 'localhost',
        origin: 'http://localhost',
        'x-csrf-token': csrfToken,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(204);

    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    const sessionCookie = setCookieHeaders.find((entry) => entry.startsWith('session_token='));
    expect(sessionCookie).toContain('session_token=;');
  });

  it('reste idempotent sur un rejeu : deux appels successifs renvoient 204 et nettoient les deux cookies', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { computeCsrfToken } = await import('../../../../lib/server/csrf');
    const csrfToken = computeCsrfToken('a'.repeat(43));

    const { POST } = await import('./route');
    const buildRequest = (): Request =>
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { host: 'localhost', origin: 'http://localhost', 'x-csrf-token': csrfToken },
      });

    const first = await POST(buildRequest());
    const second = await POST(buildRequest());

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const response of [first, second]) {
      const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
      const sessionCookie = setCookieHeaders.find((entry) => entry.startsWith('session_token='));
      const csrfCookie = setCookieHeaders.find((entry) => entry.startsWith('csrf_token='));
      expect(sessionCookie).toContain('session_token=;');
      expect(csrfCookie).toContain('csrf_token=;');
    }
  });

  it('nettoie les deux cookies même si l\'appel backend échoue ou expire', async () => {
    cookieStore.set('session_token', 'a'.repeat(43));

    globalThis.fetch = vi.fn(async () => {
      throw new Error('réseau indisponible');
    }) as unknown as typeof fetch;

    const { computeCsrfToken } = await import('../../../../lib/server/csrf');
    const csrfToken = computeCsrfToken('a'.repeat(43));

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://localhost', 'x-csrf-token': csrfToken },
    });

    const response = await POST(request);
    expect(response.status).toBe(204);

    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    const sessionCookie = setCookieHeaders.find((entry) => entry.startsWith('session_token='));
    const csrfCookie = setCookieHeaders.find((entry) => entry.startsWith('csrf_token='));
    expect(sessionCookie).toContain('session_token=;');
    expect(csrfCookie).toContain('csrf_token=;');
  });
});
