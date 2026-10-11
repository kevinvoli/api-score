import { AuthUser, isBffErrorBody, isAuthUser, SESSION_CSRF_HEADER_NAME } from '../types/auth';
import { readCsrfCookie } from './client';

/**
 * Utilisateur de la session courante via le BFF. `null` si aucune session (401) : ce n'est pas
 * une erreur, c'est l'état « déconnecté » — aucun appelant ne doit rediriger depuis ici, la page
 * `/login` partageant le layout qui affiche le menu de session.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) {
    return null;
  }
  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(isBffErrorBody(parsed) ? parsed.error : `Session illisible (${response.status})`);
  }
  if (typeof parsed !== 'object' || parsed === null || !isAuthUser((parsed as { user?: unknown }).user)) {
    throw new Error('Réponse de session invalide');
  }
  return (parsed as { user: AuthUser }).user;
}

/**
 * Déconnexion : révoque la session côté backend et efface les cookies. La route BFF est
 * idempotente ; sans cookie CSRF (session déjà perdue), l'appel part sans en-tête et le BFF
 * nettoie quand même s'il n'y a plus de session. Renvoie `true` si le BFF a confirmé.
 */
export async function logout(): Promise<boolean> {
  const csrfToken = readCsrfCookie();
  const headers: Record<string, string> = {};
  if (csrfToken) {
    headers[SESSION_CSRF_HEADER_NAME] = csrfToken;
  }
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers,
  });
  return response.ok;
}
