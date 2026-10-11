import { NextResponse } from 'next/server';
import {
  BackendTimeoutError,
  callBackend,
  normalizeBackendError,
  parseJsonSafely,
} from '../../../../lib/server/backend-client';
import { isPathAllowed } from '../../../../lib/server/bff-allowlist';
import { CSRF_HEADER_NAME, isCsrfTokenValid, isOriginValid } from '../../../../lib/server/csrf';
import { readSessionToken } from '../../../../lib/server/session-cookie';

interface RouteContext {
  params: { path: string[] };
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Borne défensive sur la taille d'un corps de mutation proxyfiée (M9 lot 2.1 : DoS mémoire). */
const MAX_BODY_BYTES = 1_000_000;

/**
 * Rejette tout segment qui pourrait faire sortir la cible du préfixe backend attendu :
 * `..`, un `/` (y compris décodé depuis `%2f`), un `%2e`/`%2f` encodé, ou un `:` de schéma.
 */
const FORBIDDEN_SEGMENT_PATTERN = /\.\.|%2e|%2f|\/|:/i;

function sanitizeSegments(rawSegments: string[] | undefined): string[] | null {
  if (!rawSegments || rawSegments.length === 0) {
    return null;
  }
  for (const segment of rawSegments) {
    if (segment.length === 0 || FORBIDDEN_SEGMENT_PATTERN.test(segment)) {
      return null;
    }
  }
  return rawSegments;
}

async function handleProxy(
  request: Request,
  context: RouteContext,
  method: string,
): Promise<NextResponse> {
  const segments = sanitizeSegments(context.params.path);
  if (!segments) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  // M8 : la session est vérifiée avant l'allowlist. Sinon un appelant non authentifié distingue
  // 403 (hors allowlist) de 401 (dans l'allowlist) et énumère le périmètre proxyfié.
  const sessionToken = readSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: 'Session absente' }, { status: 401 });
  }

  const backendPath = `/${segments.join('/')}`;

  if (!isPathAllowed(method, backendPath)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  let body: string | undefined;

  if (MUTATING_METHODS.has(method)) {
    if (!isOriginValid(request)) {
      return NextResponse.json({ error: 'Origine invalide' }, { status: 403 });
    }
    const providedCsrfToken = request.headers.get(CSRF_HEADER_NAME);
    if (!isCsrfTokenValid(sessionToken, providedCsrfToken)) {
      return NextResponse.json({ error: 'Jeton CSRF invalide' }, { status: 403 });
    }

    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Corps de requête trop volumineux' }, { status: 413 });
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Corps de requête trop volumineux' }, { status: 413 });
    }
    body = rawBody.length > 0 ? rawBody : undefined;
  }

  const requestUrl = new URL(request.url);
  const fullPath = `${backendPath}${requestUrl.search}`;

  try {
    const backendResponse = await callBackend({
      method,
      path: fullPath,
      sessionToken,
      body,
    });

    if (backendResponse.status >= 400) {
      const parsedBody = parseJsonSafely(backendResponse.bodyText);
      const normalized = normalizeBackendError(backendResponse.status, parsedBody);
      return NextResponse.json({ error: normalized.error }, { status: normalized.status });
    }

    // M7 : le content-type backend n'est jamais relayé verbatim (un backend renvoyant du HTML
    // ferait servir du HTML depuis l'origine de l'app) ; une réponse authentifiée n'est jamais
    // cachable par un intermédiaire.
    return new NextResponse(backendResponse.bodyText, {
      status: backendResponse.status,
      headers: {
        'content-type': 'application/json',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    });
  } catch (error: unknown) {
    if (error instanceof BackendTimeoutError) {
      return NextResponse.json({ error: 'Le service backend ne répond pas' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 502 });
  }
}

export const GET = (request: Request, context: RouteContext): Promise<NextResponse> =>
  handleProxy(request, context, 'GET');

export const POST = (request: Request, context: RouteContext): Promise<NextResponse> =>
  handleProxy(request, context, 'POST');

export const PUT = (request: Request, context: RouteContext): Promise<NextResponse> =>
  handleProxy(request, context, 'PUT');

export const PATCH = (request: Request, context: RouteContext): Promise<NextResponse> =>
  handleProxy(request, context, 'PATCH');

export const DELETE = (request: Request, context: RouteContext): Promise<NextResponse> =>
  handleProxy(request, context, 'DELETE');
