import * as crypto from 'crypto';
import type { NextResponse } from 'next/server';
import { SESSION_CSRF_COOKIE_NAME, SESSION_CSRF_HEADER_NAME } from '../types/auth';
import { isSessionCookieSecure } from './session-cookie';

export const CSRF_COOKIE_NAME = SESSION_CSRF_COOKIE_NAME;
export const CSRF_HEADER_NAME = SESSION_CSRF_HEADER_NAME;

const getCsrfSecret = (): string => {
  const secret = process.env.CSRF_SECRET;
  if (!secret) {
    throw new Error('CSRF_SECRET manquant');
  }
  return secret;
};

/** Jeton CSRF en double soumission : déterministe à partir de la session, sans état serveur. */
export const computeCsrfToken = (sessionToken: string): string =>
  crypto.createHmac('sha256', getCsrfSecret()).update(sessionToken).digest('hex');

export const isCsrfTokenValid = (
  sessionToken: string,
  providedToken: string | null,
): boolean => {
  if (!providedToken) {
    return false;
  }
  const expected = Buffer.from(computeCsrfToken(sessionToken));
  const provided = Buffer.from(providedToken);
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
};

/** `maxAgeSeconds` doit être identique à celui posé sur le cookie de session (voir B2 lot 2.1) :
 *  sinon le cookie CSRF survit moins longtemps qu'une session navigateur persistante, et toute
 *  mutation (y compris le logout) échoue en 403 opaque jusqu'à un retour manuel sur /login. */
export const setCsrfCookie = (
  response: NextResponse,
  sessionToken: string,
  maxAgeSeconds: number,
): void => {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: computeCsrfToken(sessionToken),
    httpOnly: false,
    secure: isSessionCookieSecure(),
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSeconds,
  });
};

export const clearCsrfCookie = (response: NextResponse): void => {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: '',
    httpOnly: false,
    secure: isSessionCookieSecure(),
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
};

const getAllowedOrigins = (): string[] => {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

/** Borne la mémoire du diagnostic : un attaquant ne peut pas le transformer en fuite mémoire. */
const MAX_REPORTED_ORIGINS = 20;
const reportedOrigins = new Set<string>();
let missingConfigReported = false;

/**
 * Diagnostic serveur d'un refus d'origine, une fois par cause. Le refus reste systématique ;
 * seul le message manquait : sans lui, un `ALLOWED_ORIGINS` absent ou un accès par
 * `127.0.0.1` au lieu de `localhost` se présente comme un « problème CORS » opaque.
 * Ne journalise que des origines (publiques par nature), jamais de cookie ni de jeton.
 */
const reportRejectedOrigin = (origin: string | null, allowed: string[]): void => {
  if (allowed.length === 0) {
    if (missingConfigReported) return;
    missingConfigReported = true;
    // eslint-disable-next-line no-console -- journal serveur volontaire : seule trace d'une config absente
    console.error(
      '[bff] ALLOWED_ORIGINS est vide ou absent : toute mutation (connexion comprise) est refusée en 403. ' +
        'Renseigner ALLOWED_ORIGINS dans front/.env.local (ex. http://localhost:3000) puis redémarrer Next.',
    );
    return;
  }
  const key = origin ?? '(en-tête Origin absent)';
  if (reportedOrigins.has(key) || reportedOrigins.size >= MAX_REPORTED_ORIGINS) return;
  reportedOrigins.add(key);
  // eslint-disable-next-line no-console -- journal serveur volontaire : origine refusée (publique)
  console.warn(
    `[bff] Mutation refusée : origine ${JSON.stringify(key)} absente de ALLOWED_ORIGINS (${allowed.join(', ')}).`,
  );
};

/** Réservé aux tests : réarme le diagnostic « une fois par cause ». */
export const resetOriginDiagnosticsForTests = (): void => {
  reportedOrigins.clear();
  missingConfigReported = false;
};

/**
 * Compare l'en-tête `Origin` à une liste d'origines de confiance issue de la configuration
 * serveur (`ALLOWED_ORIGINS`), jamais à `Host`/`X-Forwarded-Host` : ces deux en-têtes sont
 * fournis par l'appelant et ne prouvent rien seuls (voir M6 lot 2.1). Sans configuration,
 * refuse par défaut.
 */
export const isOriginValid = (request: Request): boolean => {
  const origin = request.headers.get('origin');
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    return true;
  }
  reportRejectedOrigin(origin, allowed);
  return false;
};
