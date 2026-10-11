import { SESSION_CSRF_COOKIE_NAME, SESSION_CSRF_HEADER_NAME } from '../types/auth';

type FetchOptions = RequestInit & {
  query?: Record<string, unknown>;
};

// Lot 2 : plus aucun appel direct au backend ni de clé API côté navigateur. Tout passe par le
// proxy BFF même origine, qui porte seul le secret serveur et la session.
const BFF_PREFIX = '/api/backend';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const buildUrl = (path: string, query?: Record<string, unknown>) => {
  const url = `${BFF_PREFIX}${path}`;
  if (!query) {
    return url;
  }
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    searchParams.set(key, String(value));
  });
  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
};

export const readCsrfCookie = (): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  const prefix = `${SESSION_CSRF_COOKIE_NAME}=`;
  const match = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
};

/**
 * Erreur HTTP du BFF. Le message reste celui d'origine (`API error (status): corps`) pour les
 * appelants existants ; `status` et `serverMessage` permettent de distinguer un conflit de
 * version (409) ou un refus de droits (403) sans analyser le texte.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;

  constructor(status: number, body: string) {
    super(`API error (${status}): ${body}`);
    this.name = 'ApiError';
    this.status = status;
    this.serverMessage = extractServerMessage(body);
  }
}

const extractServerMessage = (body: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      const error = (parsed as Record<string, unknown>).error;
      if (typeof error === 'string' && error.trim()) {
        return error;
      }
    }
  } catch {
    // Corps non JSON : pas de message exploitable.
  }
  return null;
};

export const LOGIN_PATH = '/login';

/**
 * Session expirée ou révoquée côté backend alors que le cookie est encore présent : sans
 * redirection, les pages restaient en erreur. Jamais depuis `/login` lui-même (pas de boucle).
 */
export const redirectToLogin = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.location.pathname === LOGIN_PATH) {
    return;
  }
  window.location.assign(LOGIN_PATH);
};

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);
  const method = (options.method ?? 'GET').toUpperCase();
  const csrfHeaders: Record<string, string> = {};
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCsrfCookie();
    // M13 : sans cookie CSRF, la mutation partirait quand même sans en-tête et reviendrait en
    // 403 opaque. On échoue tôt avec un message explicite plutôt que de laisser l'appelant
    // deviner que sa session a expiré.
    if (!csrfToken) {
      throw new Error('Session expirée, veuillez vous reconnecter.');
    }
    csrfHeaders[SESSION_CSRF_HEADER_NAME] = csrfToken;
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders,
      ...(options.headers ?? {})
    }
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Session expirée, veuillez vous reconnecter.');
  }

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body);
  }

  return response.json();
}
