import { NextRequest, NextResponse } from 'next/server';

// Doit rester autonome : le middleware tourne en runtime Edge et ne peut pas importer
// `lib/server/session-cookie.ts` (dépend de `next/headers`, réservé aux Route Handlers).
const DEFAULT_SESSION_COOKIE_NAME = 'session_token';

const PUBLIC_PATH_PREFIXES = ['/login', '/api', '/_next', '/favicon.ico'];

const getSessionCookieName = (): string =>
  process.env.SESSION_COOKIE_NAME ?? DEFAULT_SESSION_COOKIE_NAME;

/**
 * Redirection de confort uniquement : la frontière de sécurité réelle est le backend, qui
 * revalide la session à chaque appel via le proxy BFF. Aucune logique d'autorisation ici.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has(getSessionCookieName());
  if (!hasSessionCookie) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
