import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

const DEFAULT_SESSION_COOKIE_NAME = 'session_token';

export const getSessionCookieName = (): string =>
  process.env.SESSION_COOKIE_NAME ?? DEFAULT_SESSION_COOKIE_NAME;

export const isSessionCookieSecure = (): boolean =>
  process.env.SESSION_COOKIE_SECURE !== 'false';

export const computeMaxAgeSeconds = (expiresAtIso: string): number => {
  const expiresAtMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresAtMs)) {
    return 0;
  }
  const diffSeconds = Math.floor((expiresAtMs - Date.now()) / 1000);
  return diffSeconds > 0 ? diffSeconds : 0;
};

export const readSessionToken = (): string | null => {
  const value = cookies().get(getSessionCookieName())?.value;
  return value && value.length > 0 ? value : null;
};

export const setSessionCookie = (
  response: NextResponse,
  sessionToken: string,
  expiresAtIso: string,
): void => {
  response.cookies.set({
    name: getSessionCookieName(),
    value: sessionToken,
    httpOnly: true,
    secure: isSessionCookieSecure(),
    sameSite: 'strict',
    path: '/',
    maxAge: computeMaxAgeSeconds(expiresAtIso),
  });
};

export const clearSessionCookie = (response: NextResponse): void => {
  response.cookies.set({
    name: getSessionCookieName(),
    value: '',
    httpOnly: true,
    secure: isSessionCookieSecure(),
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
};
