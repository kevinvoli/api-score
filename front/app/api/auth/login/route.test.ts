import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

function buildBackendResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isSetCookieArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function findCookie(setCookieHeaders: string[], name: string): string | undefined {
  return setCookieHeaders.find((entry) => entry.startsWith(`${name}=`));
}

const VALID_ORIGIN_HEADERS = { host: 'localhost', origin: 'http://localhost' };

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ALLOWED_ORIGINS = 'http://localhost';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('pose un cookie de session HttpOnly/Secure/SameSite=Strict et ne renvoie jamais le sessionToken', async () => {
    process.env.SESSION_COOKIE_SECURE = 'true';

    globalThis.fetch = vi.fn(async () =>
      buildBackendResponse(200, {
        sessionToken: 'a'.repeat(43),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: { id: 'u1', email: 'user@example.com', role: 'ADMIN' },
      }),
    ) as unknown as typeof fetch;

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'user@example.com', password: 'super-secret-password' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload: unknown = await response.json();
    expect(payload).toEqual({ user: { id: 'u1', email: 'user@example.com', role: 'ADMIN' } });
    expect(JSON.stringify(payload)).not.toContain('sessionToken');

    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    expect(isSetCookieArray(setCookieHeaders)).toBe(true);

    const sessionCookie = findCookie(setCookieHeaders, 'session_token');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie?.toLowerCase()).toContain('samesite=strict');

    process.env.SESSION_COOKIE_SECURE = 'false';
  });

  it('normalise une réponse backend 401 sans relayer le corps brut', async () => {
    globalThis.fetch = vi.fn(async () =>
      buildBackendResponse(401, { code: 'UNAUTHORIZED', message: 'Invalid credentials', details: null, traceId: 't1' }),
    ) as unknown as typeof fetch;

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'user@example.com', password: 'wrong-password' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const payload: unknown = await response.json();
    expect(payload).toEqual({ error: 'Invalid credentials' });
    expect(JSON.stringify(payload)).not.toContain('traceId');
  });

  it('refuse un corps de requête invalide (champ manquant)', async () => {
    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'user@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('pose Path=/ et un Max-Age dérivé de expiresAt sur le cookie de session', async () => {
    const expiresAt = new Date(Date.now() + 120_000).toISOString();

    globalThis.fetch = vi.fn(async () =>
      buildBackendResponse(200, {
        sessionToken: 'b'.repeat(43),
        expiresAt,
        user: { id: 'u2', email: 'user2@example.com', role: 'VIEWER' },
      }),
    ) as unknown as typeof fetch;

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'user2@example.com', password: 'another-secret-password' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    const sessionCookie = findCookie(setCookieHeaders, 'session_token');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('Path=/');

    const maxAgeMatch = sessionCookie?.match(/Max-Age=(\d+)/i);
    expect(maxAgeMatch).not.toBeNull();
    const maxAgeSeconds = Number(maxAgeMatch?.[1]);
    expect(maxAgeSeconds).toBeGreaterThan(110);
    expect(maxAgeSeconds).toBeLessThanOrEqual(120);
  });

  it('pose un cookie CSRF avec le même Max-Age que le cookie de session (B2)', async () => {
    const expiresAt = new Date(Date.now() + 120_000).toISOString();

    globalThis.fetch = vi.fn(async () =>
      buildBackendResponse(200, {
        sessionToken: 'c'.repeat(43),
        expiresAt,
        user: { id: 'u3', email: 'user3@example.com', role: 'VIEWER' },
      }),
    ) as unknown as typeof fetch;

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'user3@example.com', password: 'another-secret-password' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    const sessionCookie = findCookie(setCookieHeaders, 'session_token');
    const csrfCookie = findCookie(setCookieHeaders, 'csrf_token');
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toContain('Max-Age=0');

    const sessionMaxAge = Number(sessionCookie?.match(/Max-Age=(\d+)/i)?.[1]);
    const csrfMaxAge = Number(csrfCookie?.match(/Max-Age=(\d+)/i)?.[1]);
    expect(csrfMaxAge).toBe(sessionMaxAge);
  });

  it('refuse une mutation cross-origin sans appeler le backend (B1)', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'localhost',
        origin: 'http://evil.example',
      },
      body: JSON.stringify({ email: 'user@example.com', password: 'super-secret-password' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une requête sans en-tête Origin, sans appeler le backend (B1)', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'super-secret-password' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renvoie 502 "Réponse backend invalide" sur un 200 au corps non conforme, sans redescendre en 200 (B3)', async () => {
    globalThis.fetch = vi.fn(async () =>
      buildBackendResponse(200, { unexpected: 'shape' }),
    ) as unknown as typeof fetch;

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'user@example.com', password: 'super-secret-password' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(502);

    const payload: unknown = await response.json();
    expect(payload).toEqual({ error: 'Réponse backend invalide' });

    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    expect(setCookieHeaders.length).toBe(0);
  });

  it('renvoie 502 "Réponse backend invalide" quand expiresAt est déjà passé (M4)', async () => {
    globalThis.fetch = vi.fn(async () =>
      buildBackendResponse(200, {
        sessionToken: 'd'.repeat(43),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        user: { id: 'u4', email: 'user4@example.com', role: 'VIEWER' },
      }),
    ) as unknown as typeof fetch;

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'user4@example.com', password: 'another-secret-password' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(502);

    const payload: unknown = await response.json();
    expect(payload).toEqual({ error: 'Réponse backend invalide' });

    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    expect(setCookieHeaders.length).toBe(0);
  });

  describe('diagnostic des refus d’origine', () => {
    async function postLogin(headers: Record<string, string>): Promise<Response> {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;
      const { POST } = await import('./route');
      const response = await POST(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ email: 'user@example.com', password: 'super-secret-password' }),
        }),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      return response;
    }

    it('ALLOWED_ORIGINS absent : refus 403 et message de configuration explicite, une seule fois', async () => {
      delete process.env.ALLOWED_ORIGINS;
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      expect((await postLogin(VALID_ORIGIN_HEADERS)).status).toBe(403);
      expect((await postLogin(VALID_ORIGIN_HEADERS)).status).toBe(403);

      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0])).toContain('ALLOWED_ORIGINS est vide ou absent');
    });

    it('origine hors liste : refus 403, l’origine reçue et la liste attendue sont journalisées', async () => {
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const response = await postLogin({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' });

      expect(response.status).toBe(403);
      expect(String(warn.mock.calls[0][0])).toContain('"http://127.0.0.1:3000"');
      expect(String(warn.mock.calls[0][0])).toContain('http://localhost:3000');
    });

    it('ne journalise jamais le corps, le mot de passe ni un cookie', async () => {
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await postLogin({ origin: 'https://evil.example', cookie: 'session_token=abc' });

      const logged = warn.mock.calls.flat().map(String).join(' ');
      expect(logged).not.toContain('super-secret-password');
      expect(logged).not.toContain('session_token=abc');
    });
  });
});

