import { NextResponse } from 'next/server';
import { callBackend } from '../../../../lib/server/backend-client';
import { CSRF_HEADER_NAME, clearCsrfCookie, isCsrfTokenValid, isOriginValid } from '../../../../lib/server/csrf';
import { clearSessionCookie, readSessionToken } from '../../../../lib/server/session-cookie';

export async function POST(request: Request): Promise<NextResponse> {
  const sessionToken = readSessionToken();

  // Rien à révoquer : idempotent, pas de frontière CSRF à faire respecter sur un no-op.
  if (!sessionToken) {
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response);
    clearCsrfCookie(response);
    return response;
  }

  if (!isOriginValid(request)) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 });
  }

  const providedCsrfToken = request.headers.get(CSRF_HEADER_NAME);
  if (!isCsrfTokenValid(sessionToken, providedCsrfToken)) {
    return NextResponse.json({ error: 'Jeton CSRF invalide' }, { status: 403 });
  }

  try {
    await callBackend({
      method: 'POST',
      path: '/v1/auth/logout',
      sessionToken,
    });
  } catch {
    // Le logout BFF reste idempotent même si le backend est inatteignable : les cookies sont
    // nettoyés dans tous les cas, quitte à laisser la session backend s'éteindre à expiration.
  }

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  clearCsrfCookie(response);
  return response;
}
