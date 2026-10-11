import { NextResponse } from 'next/server';
import {
  BackendTimeoutError,
  callBackend,
  normalizeBackendError,
  parseJsonSafely,
} from '../../../../lib/server/backend-client';
import { readSessionToken } from '../../../../lib/server/session-cookie';
import { isAuthUser } from '../../../../lib/types/auth';

export async function GET(): Promise<NextResponse> {
  const sessionToken = readSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: 'Session absente' }, { status: 401 });
  }

  try {
    const backendResponse = await callBackend({
      method: 'GET',
      path: '/v1/auth/me',
      sessionToken,
    });

    const parsedBody = parseJsonSafely(backendResponse.bodyText);
    const isSuccessStatus = backendResponse.status >= 200 && backendResponse.status < 300;

    if (!isSuccessStatus) {
      const normalized = normalizeBackendError(backendResponse.status, parsedBody);
      return NextResponse.json({ error: normalized.error }, { status: normalized.status });
    }

    // B3 : un 2xx au corps non conforme ne doit jamais retomber sur normalizeBackendError.
    if (!isAuthUser(parsedBody)) {
      return NextResponse.json({ error: 'Réponse backend invalide' }, { status: 502 });
    }

    return NextResponse.json({ user: parsedBody }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof BackendTimeoutError) {
      return NextResponse.json({ error: 'Le service backend ne répond pas' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 502 });
  }
}
