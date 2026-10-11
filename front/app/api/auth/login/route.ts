import { NextResponse } from 'next/server';
import {
  BackendTimeoutError,
  callBackend,
  normalizeBackendError,
  parseJsonSafely,
} from '../../../../lib/server/backend-client';
import { isOriginValid, setCsrfCookie } from '../../../../lib/server/csrf';
import { computeMaxAgeSeconds, setSessionCookie } from '../../../../lib/server/session-cookie';
import { isLoginBackendResponse, isLoginRequestBody } from '../../../../lib/types/auth';

export async function POST(request: Request): Promise<NextResponse> {
  // Mutation : pose deux cookies sur la victime si l'appel est forgé cross-site (B1 lot 2.1).
  if (!isOriginValid(request)) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  if (!isLoginRequestBody(rawBody)) {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  try {
    const backendResponse = await callBackend({
      method: 'POST',
      path: '/v1/auth/login',
      body: JSON.stringify({ email: rawBody.email, password: rawBody.password }),
    });

    const parsedBody = parseJsonSafely(backendResponse.bodyText);
    const isSuccessStatus = backendResponse.status >= 200 && backendResponse.status < 300;

    if (!isSuccessStatus) {
      const normalized = normalizeBackendError(backendResponse.status, parsedBody);
      return NextResponse.json({ error: normalized.error }, { status: normalized.status });
    }

    // B3 : un 2xx au corps non conforme ne doit jamais retomber sur normalizeBackendError, qui
    // le ferait passer pour un 200 valide côté page de login.
    if (!isLoginBackendResponse(parsedBody)) {
      return NextResponse.json({ error: 'Réponse backend invalide' }, { status: 502 });
    }

    // M4 : un expiresAt absent/malformé/déjà passé donne maxAge <= 0, donc une suppression
    // immédiate du cookie malgré un 200 { user } — même impasse silencieuse que B3.
    const maxAgeSeconds = computeMaxAgeSeconds(parsedBody.expiresAt);
    if (maxAgeSeconds <= 0) {
      return NextResponse.json({ error: 'Réponse backend invalide' }, { status: 502 });
    }

    const response = NextResponse.json({ user: parsedBody.user }, { status: 200 });
    setSessionCookie(response, parsedBody.sessionToken, parsedBody.expiresAt);
    setCsrfCookie(response, parsedBody.sessionToken, maxAgeSeconds);
    return response;
  } catch (error: unknown) {
    if (error instanceof BackendTimeoutError) {
      return NextResponse.json({ error: 'Le service backend ne répond pas' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 502 });
  }
}
